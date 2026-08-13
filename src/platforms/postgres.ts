import {
  ACTIVE_POSTGRES_URL,
  POSTGRES_PROVIDER,
  POSTGRES_SSL_ENABLED,
} from '@/app/config';
import { removeParamsFromUrl } from '@/utility/url';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const SUPABASE_LOCK_LEASE_MS = 10 * 60 * 1000;
const SUPABASE_LOCK_RENEW_MS = 60 * 1000;
const SUPABASE_LOCK_WAIT_MS = 100;
const SUPABASE_LOCK_MAX_WAIT_MS = 10 * 60 * 1000;

const pool = new Pool({
  ...ACTIVE_POSTGRES_URL && {
    connectionString: removeParamsFromUrl(
      ACTIVE_POSTGRES_URL,
      ['sslmode'],
    ),
  },
  ...POSTGRES_SSL_ENABLED && { ssl: true },
});

export type Primitive =
  | string
  | number
  | boolean
  | undefined
  | null
  | readonly (string | number | boolean | null)[];

export const query = async <T extends QueryResultRow = any>(
  queryString: string,
  values: Primitive[] = [],
) => {
  const client = await pool.connect();
  let response: QueryResult<T>;
  try {
    response = await client.query<T>(queryString, values);
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
  return response;
};

export const withPostgresAdvisoryLock = async <T>(
  lockA: number,
  lockB: number,
  callback: () => Promise<T>,
) => {
  if (POSTGRES_PROVIDER === 'supabase') {
    const token = crypto.randomUUID();
    await query(`
      CREATE TABLE IF NOT EXISTS media_panel_lock (
        lock_a INTEGER NOT NULL,
        lock_b INTEGER NOT NULL,
        lock_token TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (lock_a, lock_b)
    `);
    await query('ALTER TABLE media_panel_lock ENABLE ROW LEVEL SECURITY');
    await query('REVOKE ALL ON TABLE media_panel_lock FROM PUBLIC');
    await query('REVOKE ALL ON TABLE media_panel_lock FROM anon, authenticated');

    const startedAt = Date.now();
    let acquired = false;
    while (!acquired) {
      const result = await query<{ lock_token: string }>(`
        INSERT INTO media_panel_lock (
          lock_a,
          lock_b,
          lock_token,
          expires_at
        ) VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval)
        ON CONFLICT (lock_a, lock_b) DO UPDATE SET
          lock_token=EXCLUDED.lock_token,
          expires_at=EXCLUDED.expires_at
        WHERE media_panel_lock.expires_at < now()
        RETURNING lock_token
      `, [lockA, lockB, token, String(SUPABASE_LOCK_LEASE_MS)]);
      acquired = result.rows[0]?.lock_token === token;
      if (acquired) { break; }
      if (Date.now() - startedAt >= SUPABASE_LOCK_MAX_WAIT_MS) {
        throw new Error('Timed out waiting for Supabase transaction-pool lock');
      }
      await new Promise(resolve => setTimeout(resolve, SUPABASE_LOCK_WAIT_MS));
    }

    const renewal = setInterval(() => {
      void query(`
        UPDATE media_panel_lock
        SET expires_at=now() + ($1 || ' milliseconds')::interval
        WHERE lock_a=$2 AND lock_b=$3 AND lock_token=$4
      `, [
        String(SUPABASE_LOCK_LEASE_MS),
        lockA,
        lockB,
        token,
      ]).catch(() => undefined);
    }, SUPABASE_LOCK_RENEW_MS);
    try {
      return await callback();
    } finally {
      clearInterval(renewal);
      await query(`
        DELETE FROM media_panel_lock
        WHERE lock_a=$1 AND lock_b=$2 AND lock_token=$3
      `, [lockA, lockB, token]).catch(() => undefined);
    }
  }
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [lockA, lockB]);
    return await callback();
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1, $2)', [lockA, lockB])
      .catch(() => undefined);
    client.release();
  }
};

export const withPostgresTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>,
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const sql = <T extends QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: Primitive[]
) => {
  if (!isTemplateStringsArray(strings) || !Array.isArray(values)) {
    throw new Error('Invalid template literal argument');
  }

  let result = strings[0] ?? '';

  for (let i = 1; i < strings.length; i++) {
    result += `$${i}${strings[i] ?? ''}`;
  }

  return query<T>(result, values);
};

const isTemplateStringsArray = (
  strings: unknown,
): strings is TemplateStringsArray => {
  return (
    Array.isArray(strings) && 'raw' in strings && Array.isArray(strings.raw)
  );
};

export const testDatabaseConnection = async () =>
  query('SELECt COUNT(*) FROM pg_stat_user_tables');
