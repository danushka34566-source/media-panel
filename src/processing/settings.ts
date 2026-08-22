import 'server-only';

import { query } from '@/platforms/postgres';
import {
  PROCESSING_SETTINGS_DEFAULTS,
  ProcessingSettings,
  parseProcessingSettings,
} from './settings-schema';

export const ensureProcessingSettingsTable = () => query(`
  CREATE TABLE IF NOT EXISTS processing_configuration (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )
`);

export const getProcessingSettings = async (): Promise<ProcessingSettings> => {
  await ensureProcessingSettingsTable();
  const { rows } = await query<{ key: string, value: string }>(`
    SELECT key, value FROM processing_configuration
  `);
  return parseProcessingSettings(Object.fromEntries(
    rows.map(({ key, value }) => [key, value]),
  ) as Partial<Record<keyof ProcessingSettings, string>>);
};

export const saveProcessingSettings = async (settings: ProcessingSettings) => {
  await ensureProcessingSettingsTable();
  await Promise.all(Object.entries(settings).map(([key, value]) => query(`
    INSERT INTO processing_configuration (key, value, updated_at)
    VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET
      value=EXCLUDED.value,
      updated_at=now()
  `, [key, String(value)])));
};

export const getProcessingSettingsSafe = () => getProcessingSettings()
  .catch(() => ({ ...PROCESSING_SETTINGS_DEFAULTS }));
