import 'server-only';

import { query } from '@/platforms/postgres';
import {
  SITE_ACCESS_SETTINGS_DEFAULTS,
  SITE_ACCESS_SETTINGS_SECURE_FALLBACK,
  type SiteAccessSettings,
  parseSiteAccessSettings,
} from './site-access-schema';

const SETTINGS_CACHE_MS = 5_000;
let settingsCache: {
  settings: SiteAccessSettings
  expiresAt: number
} | undefined;
let settingsRequest: Promise<SiteAccessSettings> | undefined;

const ensureSiteAccessSettingsTable = () => query(`
  CREATE TABLE IF NOT EXISTS site_access_configuration (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )
`);

const loadSiteAccessSettings = async () => {
  await ensureSiteAccessSettingsTable();
  const { rows } = await query<{ key: string, value: string }>(`
    SELECT key, value FROM site_access_configuration
  `);
  return parseSiteAccessSettings(Object.fromEntries(
    rows.map(({ key, value }) => [key, value]),
  ) as Partial<Record<keyof SiteAccessSettings, string>>);
};

export const getSiteAccessSettings = async () => {
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.settings;
  }
  if (!settingsRequest) {
    settingsRequest = loadSiteAccessSettings()
      .then(settings => {
        settingsCache = {
          settings,
          expiresAt: Date.now() + SETTINGS_CACHE_MS,
        };
        return settings;
      })
      .finally(() => { settingsRequest = undefined; });
  }
  return settingsRequest;
};

export const saveSiteAccessSettings = async (
  settings: SiteAccessSettings,
) => {
  await ensureSiteAccessSettingsTable();
  await query(`
    INSERT INTO site_access_configuration (key, value, updated_at)
    VALUES
      ('siteVisibility', $1, now()),
      ('newRegistrationsEnabled', $2, now()),
      ('loginVerificationRequired', $3, now())
    ON CONFLICT (key) DO UPDATE SET
      value=EXCLUDED.value,
      updated_at=now()
  `, [
    settings.siteVisibility,
    String(settings.newRegistrationsEnabled),
    String(settings.loginVerificationRequired),
  ]);
  settingsCache = {
    settings,
    expiresAt: Date.now() + SETTINGS_CACHE_MS,
  };
};

export const getSiteAccessSettingsSafe = () => getSiteAccessSettings()
  .catch(() => ({ ...SITE_ACCESS_SETTINGS_DEFAULTS }));

export const getSiteAccessSettingsForAuthorization = () =>
  getSiteAccessSettings()
    .catch(() => ({ ...SITE_ACCESS_SETTINGS_SECURE_FALLBACK }));
