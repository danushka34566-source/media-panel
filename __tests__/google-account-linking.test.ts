import { upsertGoogleUser } from '@/auth/users';
import {
  GOOGLE_LINK_CALLBACK, beginGoogleAccountLink, getGoogleAccountLink,
} from '@/auth/google-link';

const mockQuery = jest.fn();
const mockTransactionQuery = jest.fn();
const mockLinkCookies = new Map<string, string>();

jest.mock('../src/platforms/postgres', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withPostgresTransaction: (callback: (client: {
    query: (...args: unknown[]) => Promise<unknown>
  }) => unknown) => callback({ query: (...args: unknown[]) => mockTransactionQuery(...args) }),
}));
jest.mock('../src/app/path', () => ({ PATH_PROFILE: '/profile' }));
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => mockLinkCookies.has(name) ? { value: mockLinkCookies.get(name) } : undefined,
    set: (name: string, value: string) => { mockLinkCookies.set(name, value); },
  }),
}));

const linkAccount = async (emailVerified: boolean) => {
  const existing = {
    id: 'existing-user',
    name: 'Existing User',
    name_manually_set: true,
    email: 'person@example.com',
    email_verified: emailVerified,
    password_hash: 'untrusted-signup-password-hash',
    role: 'user',
    status: 'active',
    mobile_verified: false,
    two_factor_enabled: false,
    totp_enabled: false,
    google_linked: false,
  };
  const updated = {
    ...existing,
    email_verified: true,
    google_linked: true,
    google_sub: 'google-subject',
    password_hash: emailVerified ? existing.password_hash : null,
    has_password: emailVerified,
    created_at: new Date(0),
    updated_at: new Date(0),
  };

  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  mockTransactionQuery.mockImplementation(async (statement: string) => {
    if (statement.includes('SELECT EXISTS')) { return { rows: [{ exists: true }] }; }
    if (statement.includes('WHERE google_sub=$1')) { return { rows: [] }; }
    if (statement.includes('WHERE email=$1')) { return { rows: [existing] }; }
    if (statement.includes('UPDATE auth_users')) { return { rows: [updated] }; }
    return { rows: [], rowCount: 1 };
  });

  const user = await upsertGoogleUser({
    googleSub: 'google-subject',
    email: 'person@example.com',
    name: 'Google Name',
  });
  return { user, updateCall: mockTransactionQuery.mock.calls.find(([statement]) =>
    String(statement).includes('UPDATE auth_users')) };
};

beforeEach(() => {
  jest.resetAllMocks();
  mockLinkCookies.clear();
});

afterEach(() => jest.restoreAllMocks());

it('clears a password set before email verification when linking Google', async () => {
  const { user, updateCall } = await linkAccount(false);

  expect(user.emailVerified).toBe(true);
  expect(user.hasPassword).toBe(false);
  expect(updateCall?.[0]).toContain(
    'password_hash=CASE WHEN $5::boolean THEN NULL ELSE password_hash END',
  );
  expect(updateCall?.[1]?.[4]).toBe(true);
});

it('preserves the password for an already verified email account', async () => {
  const { user, updateCall } = await linkAccount(true);

  expect(user.hasPassword).toBe(true);
  expect(updateCall?.[1]?.[4]).toBe(false);
});

it.each(['google_sub', 'email'] as const)(
  'rejects a profile link if the %s lookup resolves to a different user',
  async field => {
    const unrelated = {
      id: 'other-user',
      email: 'person@example.com',
      email_verified: true,
      status: 'active',
    };
    mockTransactionQuery.mockImplementation(async (statement: string) => {
      if (statement.includes('SELECT EXISTS')) { return { rows: [{ exists: true }] }; }
      return { rows: statement.includes(`WHERE ${field}=$1`) ? [unrelated] : [] };
    });

    await expect(upsertGoogleUser({
      googleSub: 'google-subject',
      email: unrelated.email,
      name: 'Google User',
      expectedLinkUserId: 'original-user',
    })).rejects.toThrow('does not match your profile email');
    expect(mockTransactionQuery.mock.calls.some(([statement]) =>
      /(?:UPDATE|INSERT INTO) auth_users/.test(String(statement)),
    )).toBe(false);
  },
);

it('rejects invalid and expired profile link intents', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, AUTH_SECRET: 'test-link-key' });
  const initialTime = Date.now();
  const time = jest.spyOn(Date, 'now').mockReturnValue(initialTime);
  await expect(getGoogleAccountLink()).resolves.toBeUndefined();

  await beginGoogleAccountLink('original-user', 'User@Example.com');
  await expect(getGoogleAccountLink()).resolves.toMatchObject({
    userId: 'original-user', email: 'user@example.com',
  });
  const cookieName = 'media-panel-google-link';
  const signed = mockLinkCookies.get(cookieName)!;
  mockLinkCookies.set(cookieName, `${signed}tampered`);
  await expect(getGoogleAccountLink()).resolves.toBeNull();

  mockLinkCookies.set(cookieName, signed);
  time.mockReturnValue(initialTime + 20 * 60 * 1000);
  await expect(getGoogleAccountLink()).resolves.toBeNull();
});

it('fails closed when a linking callback has lost its intent cookie', async () => {
  mockLinkCookies.set('__Secure-authjs.callback-url', `https://example.com${GOOGLE_LINK_CALLBACK}`);
  await expect(getGoogleAccountLink()).resolves.toBeNull();
});
