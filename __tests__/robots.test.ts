import robots, { dynamic } from '../app/robots';
import { isLocalAuthBypassRequested } from '@/auth/local-audit-bypass';
import { getSiteAccessSettingsForAuthorization } from '@/auth/site-access';
import {
  SITE_ACCESS_SETTINGS_DEFAULTS,
  SITE_ACCESS_SETTINGS_SECURE_FALLBACK,
} from '@/auth/site-access-schema';

jest.mock('../src/app/config', () => ({
  BASE_URL: 'https://media.example',
  getBaseUrl: () => 'https://media.example',
}));
jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));
jest.mock('../src/auth/local-audit-bypass', () => ({
  isLocalAuthBypassRequested: jest.fn(() => false),
}));
jest.mock('../src/auth/site-access', () => ({
  getSiteAccessSettingsForAuthorization: jest.fn(),
}));

afterEach(() => jest.clearAllMocks());

it('reads the current visibility without publishing a private sitemap', async () => {
  const getSettings = jest.mocked(getSiteAccessSettingsForAuthorization);
  getSettings.mockResolvedValueOnce(SITE_ACCESS_SETTINGS_DEFAULTS)
    .mockResolvedValueOnce(SITE_ACCESS_SETTINGS_SECURE_FALLBACK);

  expect(dynamic).toBe('force-dynamic');
  const blockedPaths = [
    '/access-denied',
    '/admin',
    '/api',
    '/favorites',
    '/og',
    '/password-reset',
    '/profile',
    '/setup',
    '/sign-in',
    '/sign-up',
    '/tag/private',
    '/verify-email',
    '/verify-login',
  ];
  await expect(robots()).resolves.toEqual({
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: expect.arrayContaining(
        blockedPaths.flatMap(path => [`${path}$`, `${path}?`, `${path}/`]),
      ),
    },
    sitemap: 'https://media.example/sitemap.xml',
  });
  await expect(robots()).resolves.toEqual({
    rules: { userAgent: '*', disallow: '/' },
  });
  expect(getSettings).toHaveBeenCalledTimes(2);
});

it('blocks crawling without a settings read during a local audit', async () => {
  jest.mocked(isLocalAuthBypassRequested).mockReturnValueOnce(true);

  await expect(robots()).resolves.toEqual({
    rules: { userAgent: '*', disallow: '/' },
  });
  expect(getSiteAccessSettingsForAuthorization).not.toHaveBeenCalled();
});
