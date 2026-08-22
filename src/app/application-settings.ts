import 'server-only';

import { query } from '@/platforms/postgres';

const PUBLIC_PAGE_BUILD_KEY = 'publicPageBuildOptimizations';

export type ApplicationSettings = {
  publicPageBuildOptimizations: boolean
};

export const APPLICATION_SETTINGS_DEFAULTS: ApplicationSettings = {
  // Opt in deliberately: generating every public route can make a production
  // build expensive for large libraries. Dynamic pages remain available and
  // are revalidated through the normal media cache invalidation paths.
  publicPageBuildOptimizations: false,
};

const envDefault =
  process.env.NEXT_PUBLIC_BUILD_PUBLIC_PAGES === '1' ||
  process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_ALL_PUBLIC_PAGES === '1';

export const ensureApplicationSettingsTable = () => query(`
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
});

const parseBoolean = (value: unknown, fallback: boolean) =>
  value === undefined ? fallback : (
    value === true || value === 'true' || value === '1' || value === 'on'
  );

export const getApplicationSettings = async (): Promise<ApplicationSettings> => {
  await ensureApplicationSettingsTable();
  const { rows } = await query<{ key: string, value: string }>(`
    SELECT key, value
    FROM application_configuration
    WHERE key = $1
  `, [PUBLIC_PAGE_BUILD_KEY]);
  const stored = rows[0]?.value;
  return {
    publicPageBuildOptimizations: parseBoolean(
      stored,
      envDefault || APPLICATION_SETTINGS_DEFAULTS.publicPageBuildOptimizations,
    ),
  };
};

export const getApplicationSettingsSafe = () => getApplicationSettings()
  .catch(() => ({
    ...APPLICATION_SETTINGS_DEFAULTS,
    publicPageBuildOptimizations: envDefault,
  }));

export const saveApplicationSettings = async (
  updates: Partial<ApplicationSettings>,
) => {
  await ensureApplicationSettingsTable();
  if (updates.publicPageBuildOptimizations === undefined) { return; }
  await query(`
    INSERT INTO application_configuration (key, value, updated_at)
    VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET
      value=EXCLUDED.value,
      updated_at=now()
  `, [PUBLIC_PAGE_BUILD_KEY, String(updates.publicPageBuildOptimizations)]);
};

export const getPublicPageBuildOptimizations = async () =>
  (await getApplicationSettingsSafe()).publicPageBuildOptimizations;
