const matchesPath = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

const PRIVATE_MODE_PUBLIC_PATHS = [
  '/access-denied',
  '/password-reset',
  '/setup',
  '/sign-in',
  '/verify-email',
];

export const isPathAllowedWithoutSessionInPrivateMode = (
  pathname: string,
  newRegistrationsEnabled: boolean,
) =>
  PRIVATE_MODE_PUBLIC_PATHS.some(path => matchesPath(pathname, path)) ||
  pathname === '/verify-login' ||
  (newRegistrationsEnabled && matchesPath(pathname, '/sign-up')) ||
  matchesPath(pathname, '/api/auth') ||
  matchesPath(pathname, '/api/site-info') ||
  matchesPath(pathname, '/api/processing');
