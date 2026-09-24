import pg from 'pg';
import sharp from 'sharp';

const readNumber = (flag, fallback) => {
  const value = process.argv.find(arg => arg.startsWith(`${flag}=`))?.split('=')[1];
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return number;
};

const limit = readNumber('--limit', 200);
const concurrency = Math.min(readNumber('--concurrency', 6), 32);
const dryRun = process.argv.includes('--dry-run');
const connectionString = process.env.POSTGRES_URL;
if (!connectionString) { throw new Error('POSTGRES_URL is required'); }

const pool = new pg.Pool({
  connectionString,
  max: 12,
  connectionTimeoutMillis: 10_000,
  ssl: new URL(connectionString).hostname.includes('supabase')
    ? { rejectUnauthorized: false }
    : true,
});

let nextIndex = 0;
let updated = 0;
let skipped = 0;
let failed = 0;
const startedAt = Date.now();

try {
  const { rows } = await pool.query(`
    SELECT id, poster_url
    FROM media
    WHERE media_type = 'video'
      AND poster_url IS NOT NULL
      AND (blur_data IS NULL OR blur_data = '')
    ORDER BY id
    LIMIT $1
  `, [limit]);
  console.log(JSON.stringify({ selected: rows.length, concurrency, dryRun }));

  const worker = async () => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex++];
      try {
        const response = await fetch(row.poster_url, {
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) { throw new Error(`poster HTTP ${response.status}`); }
        const source = Buffer.from(await response.arrayBuffer());
        const tiny = await sharp(source)
          .rotate()
          .resize({ width: 160, withoutEnlargement: true })
          .jpeg({ quality: 60, mozjpeg: true })
          .toBuffer();
        const dataUrl = `data:image/jpeg;base64,${tiny.toString('base64')}`;
        if (dataUrl.length > 12_000) {
          throw new Error('inline preview exceeds 12 KB');
        }
        if (dryRun) {
          skipped++;
        } else {
          const result = await pool.query(`
            UPDATE media SET blur_data = $1
            WHERE id = $2 AND poster_url = $3
              AND (blur_data IS NULL OR blur_data = '')
          `, [dataUrl, row.id, row.poster_url]);
          if (result.rowCount === 1) { updated++; }
          else { skipped++; }
        }
      } catch (error) {
        failed++;
        console.warn(JSON.stringify({
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
      const completed = updated + skipped + failed;
      if (completed % 50 === 0 || completed === rows.length) {
        console.log(JSON.stringify({
          completed,
          total: rows.length,
          updated,
          skipped,
          failed,
          elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        }));
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (failed > 0) { process.exitCode = 1; }
} finally {
  await pool.end();
}
