import type { Session } from 'next-auth';
import type { AppUser } from './users';

export const LOCAL_AUDIT_USER_ID = 'local-ux-audit';

export const isLocalAuthBypassRequested = () =>
  process.env.NODE_ENV === 'development' &&
  process.env.MEDIA_PANEL_LOCAL_AUTH_BYPASS === '1';

export const isLoopbackHostname = (hostname: string) => {
  const normalizedHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1';
};

export const isLocalAuthBypassEnabled = () =>
  isLocalAuthBypassRequested();

export const isLocalAuditReadApiPath = (pathname: string) =>
  pathname === '/api/auth/providers' ||
  pathname === '/api/auth/session' ||
  pathname === '/api/site-info' ||
  pathname === '/api/media/full-video' ||
  /^\/api\/subtitles\/[a-zA-Z0-9_-]+$/.test(pathname);

export const createLocalAuditSession = (): Session => ({
  user: {
    id: LOCAL_AUDIT_USER_ID,
    name: 'Local UX Audit',
    email: 'local-ux-audit@example.invalid',
    image: null,
    role: 'superadmin',
    status: 'active',
    twoFactorPending: false,
  },
  expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
});

export const createLocalAuditUser = (): AppUser => ({
  id: LOCAL_AUDIT_USER_ID,
  name: 'Local UX Audit',
  nameManuallySet: true,
  email: 'local-ux-audit@example.invalid',
  role: 'superadmin',
  status: 'active',
  emailVerified: true,
  googleLinked: false,
  hasPassword: false,
  mobileVerified: false,
  twoFactorEnabled: false,
  totpEnabled: false,
  wideGridEnabled: false,
  videoPreviewMode: 'smart',
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
