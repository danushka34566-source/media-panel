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
const timeoutMs = readNumber('--timeout-ms', 20_000);
const dryRun = process.argv.includes('--dry-run');
const upgradeJpeg = process.argv.includes('--upgrade-jpeg');
const maxInlinePosterBytes = 35_980;
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
    SELECT id, poster_url, blur_data
    FROM media
    WHERE media_type = 'video'
      AND poster_url IS NOT NULL
      AND (blur_data IS NULL OR blur_data = ''
        OR ($2 AND blur_data LIKE 'data:image/jpeg;base64,%'))
    ORDER BY id
    LIMIT $1
  `, [limit, upgradeJpeg]);
  console.log(JSON.stringify({ selected: rows.length, concurrency, dryRun, upgradeJpeg }));

  const worker = async () => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex++];
      try {
        const response = await fetch(row.poster_url, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) { throw new Error(`poster HTTP ${response.status}`); }
        const source = Buffer.from(await response.arrayBuffer());
        let inlinePoster = await sharp(source)
          .rotate()
          .resize({ width: 640, withoutEnlargement: true })
          .webp({ quality: 55, effort: 4 })
          .toBuffer();
        if (inlinePoster.length > maxInlinePosterBytes) {
          inlinePoster = await sharp(source)
            .rotate()
            .resize({ width: 480, withoutEnlargement: true })
            .webp({ quality: 45, effort: 4 })
            .toBuffer();
        }
        if (inlinePoster.length > maxInlinePosterBytes) {
          inlinePoster = await sharp(source)
            .rotate()
            .resize({ width: 320, withoutEnlargement: true })
            .webp({ quality: 40, effort: 4 })
            .toBuffer();
        }
        const dataUrl = `data:image/webp;base64,${inlinePoster.toString('base64')}`;
        if (dataUrl.length > 48_000) {
          throw new Error('inline preview exceeds 48 KB');
        }
        if (dryRun) {
          skipped++;
        } else {
          const result = await pool.query(`
            UPDATE media SET blur_data = $1
            WHERE id = $2 AND poster_url = $3
              AND blur_data IS NOT DISTINCT FROM $4
          `, [dataUrl, row.id, row.poster_url, row.blur_data]);
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
