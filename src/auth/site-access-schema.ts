export type SiteVisibility = 'public' | 'private';

export type SiteAccessSettings = {
  siteVisibility: SiteVisibility
  newRegistrationsEnabled: boolean
  loginVerificationRequired: boolean
};

export const SITE_ACCESS_SETTINGS_DEFAULTS: SiteAccessSettings = {
  siteVisibility: 'public',
  newRegistrationsEnabled: true,
  loginVerificationRequired: false,
};

export const SITE_ACCESS_SETTINGS_SECURE_FALLBACK: SiteAccessSettings = {
  siteVisibility: 'private',
  newRegistrationsEnabled: false,
  loginVerificationRequired: true,
};

export const parseSiteAccessSettings = (
  values: Partial<Record<keyof SiteAccessSettings, unknown>>,
): SiteAccessSettings => ({
  siteVisibility: values.siteVisibility === 'private' ? 'private' : 'public',
  newRegistrationsEnabled: values.newRegistrationsEnabled === undefined
    ? SITE_ACCESS_SETTINGS_DEFAULTS.newRegistrationsEnabled
    : values.newRegistrationsEnabled === true ||
      values.newRegistrationsEnabled === 'true' ||
      values.newRegistrationsEnabled === '1' ||
      values.newRegistrationsEnabled === 'on',
  loginVerificationRequired: values.loginVerificationRequired === undefined
    ? SITE_ACCESS_SETTINGS_DEFAULTS.loginVerificationRequired
    : values.loginVerificationRequired === true ||
      values.loginVerificationRequired === 'true' ||
      values.loginVerificationRequired === '1' ||
      values.loginVerificationRequired === 'on',
});
