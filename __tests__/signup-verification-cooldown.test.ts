import {
  createSmsVerificationCode,
  createVerificationCode,
  sendSmsVerificationCode,
  sendVerificationEmail,
  verifyCode,
  verifySmsCode,
} from '@/auth/users';
import { query } from '@/platforms/postgres';

const mockTransactionQuery = jest.fn();
const emptyResult = { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };

jest.mock('../src/platforms/postgres', () => ({
  query: jest.fn(),
  withPostgresTransaction: async (
    callback: (client: { query: typeof mockTransactionQuery }) => Promise<unknown>,
  ) => callback({ query: mockTransactionQuery }),
}));

beforeEach(() => {
  mockTransactionQuery.mockReset();
  jest.mocked(query).mockReset().mockResolvedValue(emptyResult);
});

afterEach(() => jest.restoreAllMocks());

it('keeps the signup resend cooldown after failed-attempt code deletion', async () => {
  jest.mocked(query).mockResolvedValueOnce(emptyResult);
  mockTransactionQuery
    .mockResolvedValueOnce({ rowCount: 1 })
    .mockResolvedValueOnce({ rowCount: 0 })
    .mockResolvedValueOnce({ rowCount: 1 });
  const userId = 'user-id';
  const email = 'pending@example.com';
  await expect(createVerificationCode(userId, email, 'signup'))
    .resolves.toMatch(/^\d{6}$/);
  expect(mockTransactionQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('UPDATE auth_users'),
    [userId, 60, false],
  );

  jest.mocked(query).mockResolvedValueOnce({
    ...emptyResult,
    rows: [{ id: 'code-id', attempts: 5, expires_at: new Date(Date.now() + 60_000) }],
  }).mockResolvedValueOnce(emptyResult);
  await expect(verifyCode(email, '123456', 'signup'))
    .rejects.toThrow('Too many failed attempts');
  expect(query).toHaveBeenLastCalledWith(
    expect.stringContaining('DELETE FROM auth_verification_codes'),
    ['code-id'],
  );

  mockTransactionQuery.mockClear().mockResolvedValueOnce({ rowCount: 0 });
  await expect(createVerificationCode(userId, email, 'signup'))
    .rejects.toThrow('Please wait a minute');
  expect(mockTransactionQuery).toHaveBeenCalledTimes(1);
  expect(mockTransactionQuery).toHaveBeenLastCalledWith(
    expect.stringContaining('signup_verification_requested_at'),
    [userId, 60, false],
  );
});

it('reserves separate login cooldowns so either channel remains available', async () => {
  mockTransactionQuery.mockResolvedValueOnce({ rowCount: 0 });
  await expect(createVerificationCode('user-id', 'pending@example.com', 'login'))
    .rejects.toThrow('Please wait a minute');
  expect(mockTransactionQuery).toHaveBeenCalledTimes(1);
  expect(mockTransactionQuery).toHaveBeenLastCalledWith(
    expect.stringContaining('login_email_verification_requested_at'),
    ['user-id', 60, true],
  );

  mockTransactionQuery.mockResolvedValue({ rowCount: 1 });
  await expect(createSmsVerificationCode('user-id', '+94771234567', 'login'))
    .resolves.toMatchObject({ code: expect.stringMatching(/^\d{6}$/) });
  expect(mockTransactionQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('login_sms_verification_requested_at'),
    ['user-id', 60, true],
  );
});

it('enforces the attempt cap when a code is consumed after a concurrent attempt', async () => {
  mockTransactionQuery.mockResolvedValue({ rowCount: 1 });
  const userId = 'user-id';
  const email = 'pending@example.com';
  const code = await createVerificationCode(userId, email, 'login');
  const codeHash = mockTransactionQuery.mock.calls[2][1][4];
  jest.mocked(query).mockResolvedValueOnce({
    ...emptyResult,
    rows: [{
      id: 'code-id', user_id: userId, code_hash: codeHash, attempts: 4,
      expires_at: new Date(Date.now() + 60_000),
    }],
  }).mockResolvedValueOnce(emptyResult);

  await expect(verifyCode(email, code, 'login'))
    .rejects.toThrow('Verification code was already used');
  expect(query).toHaveBeenLastCalledWith(
    expect.stringContaining('AND attempts < 5 AND expires_at > now()'),
    ['code-id'],
  );
});

it.each(['email', 'sms', 'mobile-setup'] as const)(
  'preserves the code after failed and throttled %s resends',
  async channel => {
    const userId = 'user-id';
    const email = 'verified@example.com';
    const mobileNumber = '+94771234567';
    const purpose = channel === 'mobile-setup' ? 'mobile-setup' : 'login';
    const table = channel === 'email'
      ? 'auth_verification_codes'
      : 'auth_sms_verification_codes';
    const issue = channel === 'email'
      ? () => createVerificationCode(userId, email, 'login')
      : () => createSmsVerificationCode(userId, mobileNumber, purpose)
        .then(({ code }) => code);
    const deliver = channel === 'email'
      ? (code: string) => sendVerificationEmail({
        userId, email, name: 'User', code, purpose: 'login',
      })
      : (code: string) => sendSmsVerificationCode({
        userId, mobileNumber, code, purpose,
      });
    const verify = channel === 'email'
      ? (code: string) => verifyCode(email, code, 'login')
      : (code: string) => verifySmsCode(userId, mobileNumber, code, purpose);

    jest.replaceProperty(process, 'env', {
      ...process.env,
      RESEND_API_KEY: 'test-email-token',
      TEXTLK_API_TOKEN: 'test-sms-token',
    });
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    mockTransactionQuery.mockResolvedValue({ rowCount: 1 });
    const originalCode = await issue();
    const [originalId, , , , originalHash] =
      mockTransactionQuery.mock.calls[2][1];
    jest.mocked(query).mockResolvedValueOnce({ ...emptyResult, rowCount: 1 });
    await deliver(originalCode);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining(`UPDATE ${table} SET delivery_pending=FALSE`),
      [userId, purpose, originalHash],
    );
    expect(jest.mocked(query).mock.lastCall?.[0]).toContain(
      '(prior.created_at, prior.id) < (replacement.created_at, replacement.id)',
    );

    mockTransactionQuery.mockClear();
    const replacementCode = await issue();
    const replacementHash = mockTransactionQuery.mock.calls[2][1][4];
    expect(mockTransactionQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('AND (NOT $3::boolean OR expires_at <= now())'),
      [userId, purpose, true],
    );
    expect(mockTransactionQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('delivery_pending'),
      [
        expect.any(String), userId, expect.any(String), purpose,
        replacementHash, 5, true,
      ],
    );
    await expect(deliver(replacementCode)).rejects.toThrow('Unable to send');
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('AND (NOT $4::boolean OR delivery_pending)'),
      [userId, purpose, replacementHash, true],
    );

    mockTransactionQuery.mockClear().mockResolvedValueOnce({ rowCount: 0 });
    await expect(issue()).rejects.toThrow('Please wait a minute');
    expect(mockTransactionQuery).toHaveBeenCalledTimes(1);

    jest.mocked(query).mockClear().mockResolvedValueOnce({
      ...emptyResult,
      rows: [{
        id: originalId,
        user_id: userId,
        code_hash: originalHash,
        attempts: 2,
        expires_at: new Date(Date.now() + 60_000),
      }],
    }).mockResolvedValueOnce({ ...emptyResult, rowCount: 1 });
    await expect(verify(originalCode))
      .resolves.toBe(channel === 'email' ? userId : mobileNumber);
    expect(jest.mocked(query).mock.calls[0][0])
      .toContain('AND NOT delivery_pending');
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining(`DELETE FROM ${table}`),
      [originalId],
    );
  },
);
