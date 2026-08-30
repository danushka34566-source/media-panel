import 'server-only';

import { query } from '@/platforms/postgres';
import type { BackendStatus } from './status-state';

const ensureStatusSnapshotTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS backend_status_snapshot (
      snapshot_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (snapshot_id = 1),
      payload JSONB NOT NULL,
      synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
};

export const getLatestBackendStatusSnapshot = async () => {
  try {
    await ensureStatusSnapshotTable();
    const result = await query<{ payload: BackendStatus; synced_at: string }>(`
      SELECT payload, synced_at FROM backend_status_snapshot
      WHERE snapshot_id=1 LIMIT 1
    `);
    const row = result.rows[0];
    return row?.payload ? {
      ...row.payload,
      connected: false,
      storedSnapshot: true,
      syncedAt: row.synced_at,
    } as BackendStatus : undefined;
  } catch {
    return undefined;
  }
};

export const saveLatestBackendStatusSnapshot = async (payload: BackendStatus) => {
  try {
    await ensureStatusSnapshotTable();
    await query(`
      INSERT INTO backend_status_snapshot (snapshot_id, payload, synced_at)
      VALUES (1, $1::jsonb, now())
      ON CONFLICT (snapshot_id) DO UPDATE SET
        payload=EXCLUDED.payload, synced_at=EXCLUDED.synced_at
    `, [JSON.stringify(payload)]);
  } catch (error) {
    console.error('Unable to save backend status snapshot', error);
  }
};
