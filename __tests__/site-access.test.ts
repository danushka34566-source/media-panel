import {
  SITE_ACCESS_SETTINGS_DEFAULTS,
  SITE_ACCESS_SETTINGS_SECURE_FALLBACK,
  parseSiteAccessSettings,
} from '@/auth/site-access-schema';
import {
  isPathAllowedWithoutSessionInPrivateMode,
} from '@/auth/site-access-routes';

describe('site access configuration', () => {
  it('preserves the existing public and registration behavior by default', () => {
    expect(parseSiteAccessSettings({})).toEqual(
      SITE_ACCESS_SETTINGS_DEFAULTS,
    );
  });

  it('parses private access and both security toggles', () => {
    expect(parseSiteAccessSettings({
      siteVisibility: 'private',
      newRegistrationsEnabled: 'false',
      loginVerificationRequired: 'on',
    })).toEqual({
      siteVisibility: 'private',
      newRegistrationsEnabled: false,
      loginVerificationRequired: true,
    });
  });

  it('fails closed when authorization settings cannot be loaded', () => {
    expect(SITE_ACCESS_SETTINGS_SECURE_FALLBACK).toEqual({
      siteVisibility: 'private',
      newRegistrationsEnabled: false,
      loginVerificationRequired: true,
    });
  });
});

describe('private-site public routes', () => {
  it('allows authentication and worker endpoints without exposing content', () => {
    expect(isPathAllowedWithoutSessionInPrivateMode('/sign-in', false))
      .toBe(true);
    expect(isPathAllowedWithoutSessionInPrivateMode(
      '/api/processing/jobs/claim',
      false,
    )).toBe(true);
    expect(isPathAllowedWithoutSessionInPrivateMode('/api/site-info', false))
      .toBe(true);
    expect(isPathAllowedWithoutSessionInPrivateMode('/', false)).toBe(false);
    expect(isPathAllowedWithoutSessionInPrivateMode('/api/subtitles', false))
      .toBe(false);
  });

  it('allows sign-up only while new registrations are enabled', () => {
    expect(isPathAllowedWithoutSessionInPrivateMode('/sign-up', true))
      .toBe(true);
    expect(isPathAllowedWithoutSessionInPrivateMode('/sign-up', false))
      .toBe(false);
    expect(isPathAllowedWithoutSessionInPrivateMode('/sign-up-fake', true))
      .toBe(false);
  });
});
