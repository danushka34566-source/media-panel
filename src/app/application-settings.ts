import 'server-only';

import { query } from '@/platforms/postgres';

const STATIC_MEDIA_PAGES_KEY = 'staticMediaPages';
const STATIC_MEDIA_OG_IMAGES_KEY = 'staticMediaOgImages';
const STATIC_MEDIA_CATEGORIES_KEY = 'staticMediaCategories';
const STATIC_MEDIA_CATEGORY_OG_IMAGES_KEY = 'staticMediaCategoryOgImages';

const APPLICATION_SETTING_KEYS = [
  STATIC_MEDIA_PAGES_KEY,
  STATIC_MEDIA_OG_IMAGES_KEY,
  STATIC_MEDIA_CATEGORIES_KEY,
  STATIC_MEDIA_CATEGORY_OG_IMAGES_KEY,
] as const;

export type ApplicationSettings = {
  staticMediaPages: boolean
  staticMediaOgImages: boolean
  staticMediaCategories: boolean
  staticMediaCategoryOgImages: boolean
};

// Environment values remain a one-time/default fallback for existing
// deployments. Once an administrator saves the panel switches, the database
// values are authoritative and no environment edit is needed.
export const APPLICATION_SETTINGS_DEFAULTS: ApplicationSettings = {
  staticMediaPages:
    process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA === '1' ||
    process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_PAGES === '1',
  staticMediaOgImages:
    process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA_OG_IMAGES === '1' ||
    process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_OG_IMAGES === '1',
  staticMediaCategories:
    process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA_CATEGORIES === '1',
  staticMediaCategoryOgImages:
    process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA_CATEGORY_OG_IMAGES === '1',
};

let ensureApplicationSettingsTablePromise: Promise<unknown> | undefined;

export const ensureApplicationSettingsTable = () => {
  if (ensureApplicationSettingsTablePromise) {
    return ensureApplicationSettingsTablePromise;
  }
  ensureApplicationSettingsTablePromise = query(`
    CREATE TABLE IF NOT EXISTS application_configuration (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `).then(async result => {
    // This table is server-only configuration. Keep it out of Supabase's
    // exposed Data API even when the database uses the public schema.
    await query('ALTER TABLE application_configuration ENABLE ROW LEVEL SECURITY');
    await query('REVOKE ALL ON TABLE application_configuration FROM PUBLIC');
    return result;
  }).catch(error => {
    ensureApplicationSettingsTablePromise = undefined;
    throw error;
  });
  return ensureApplicationSettingsTablePromise;
};

const parseBoolean = (value: unknown, fallback: boolean) =>
  value === undefined ? fallback : (
    value === true || value === 'true' || value === '1' || value === 'on'
  );

export const getApplicationSettings = async (): Promise<ApplicationSettings> => {
  await ensureApplicationSettingsTable();
  const { rows } = await query<{ key: string, value: string }>(`
    SELECT key, value
    FROM application_configuration
    WHERE key = ANY($1::text[])
  `, [APPLICATION_SETTING_KEYS]);
  const stored = new Map(rows.map(row => [row.key, row.value]));
  return {
    staticMediaPages: parseBoolean(
      stored.get(STATIC_MEDIA_PAGES_KEY),
      APPLICATION_SETTINGS_DEFAULTS.staticMediaPages,
    ),
    staticMediaOgImages: parseBoolean(
      stored.get(STATIC_MEDIA_OG_IMAGES_KEY),
      APPLICATION_SETTINGS_DEFAULTS.staticMediaOgImages,
    ),
    staticMediaCategories: parseBoolean(
      stored.get(STATIC_MEDIA_CATEGORIES_KEY),
      APPLICATION_SETTINGS_DEFAULTS.staticMediaCategories,
    ),
    staticMediaCategoryOgImages: parseBoolean(
      stored.get(STATIC_MEDIA_CATEGORY_OG_IMAGES_KEY),
      APPLICATION_SETTINGS_DEFAULTS.staticMediaCategoryOgImages,
    ),
  };
};

export const getApplicationSettingsSafe = () => getApplicationSettings()
  .catch(() => ({ ...APPLICATION_SETTINGS_DEFAULTS }));

export const saveApplicationSettings = async (
  updates: Partial<ApplicationSettings>,
) => {
  await ensureApplicationSettingsTable();
  const entries = Object.entries(updates)
    .filter((entry): entry is [keyof ApplicationSettings, boolean] =>
      typeof entry[1] === 'boolean');
  if (entries.length === 0) { return; }
  const keys = entries.map(([key]) => key);
  const values = entries.map(([, value]) => String(value));
  await query(`
    INSERT INTO application_configuration (key, value, updated_at)
    SELECT settings.key, settings.value, now()
    FROM unnest($1::text[], $2::text[]) AS settings(key, value)
    ON CONFLICT (key) DO UPDATE SET
      value=EXCLUDED.value,
      updated_at=now()
  `, [keys, values]);
};
