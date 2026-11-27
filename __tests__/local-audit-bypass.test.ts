import {
  isLocalAuditReadApiPath,
  isLocalAuthBypassRequested,
  isLoopbackHostname,
} from '../src/auth/local-audit-bypass';

const mutableEnv = process.env as unknown as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;
const originalBypass = mutableEnv.MEDIA_PANEL_LOCAL_AUTH_BYPASS;

afterEach(() => {
  if (originalNodeEnv === undefined) { delete mutableEnv.NODE_ENV; }
  else { mutableEnv.NODE_ENV = originalNodeEnv; }
  if (originalBypass === undefined) {
    delete mutableEnv.MEDIA_PANEL_LOCAL_AUTH_BYPASS;
  } else {
    mutableEnv.MEDIA_PANEL_LOCAL_AUTH_BYPASS = originalBypass;
  }
});

it('enables the audit session only in development with explicit opt-in', () => {
  mutableEnv.NODE_ENV = 'development';
  mutableEnv.MEDIA_PANEL_LOCAL_AUTH_BYPASS = '1';
  expect(isLocalAuthBypassRequested()).toBe(true);

  mutableEnv.MEDIA_PANEL_LOCAL_AUTH_BYPASS = 'true';
  expect(isLocalAuthBypassRequested()).toBe(false);

  mutableEnv.MEDIA_PANEL_LOCAL_AUTH_BYPASS = '1';
  mutableEnv.NODE_ENV = 'production';
  expect(isLocalAuthBypassRequested()).toBe(false);
});

it('recognizes only loopback hostnames', () => {
  for (const hostname of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]']) {
    expect(isLoopbackHostname(hostname)).toBe(true);
  }
  for (const hostname of ['localhost.example.com', '192.168.1.2', '::2']) {
    expect(isLoopbackHostname(hostname)).toBe(false);
  }
});

it('allows only the read-only API routes needed by local auditing', () => {
  for (const path of [
    '/api/auth/providers',
    '/api/auth/session',
    '/api/site-info',
    '/api/media/full-video',
    '/api/subtitles/track_1',
  ]) {
    expect(isLocalAuditReadApiPath(path)).toBe(true);
  }
  for (const path of [
    '/api/admin/users',
    '/api/auth/callback/google',
    '/api/subtitles/track/extra',
    '/api/subtitles/track.1',
  ]) {
    expect(isLocalAuditReadApiPath(path)).toBe(false);
  }
});
