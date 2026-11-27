import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NextAuth, { type NextAuthConfig, type Session } from 'next-auth';
import { NextRequest } from 'next/server';
import SignInPage from '../app/sign-in/page';
import VerifyLoginPage from '../app/verify-login/page';
import { VerifyEmailForm } from '@/auth/AuthFlowForms';
import {
  completePendingSignInVerificationAction,
  confirmProfileEmailChangeAction,
  getUsersAction,
  resendSignUpVerificationAction,
  saveProfileAction,
  signInAction,
} from '@/auth/actions';
import { isSessionAuthorized } from '@/auth/api';
import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { VerificationCodeCooldownError } from '@/auth/login-verification';
import { clearGoogleAccountLink, getGoogleAccountLink } from '@/auth/google-link';
import {
  createSmsVerificationCode,
  createVerificationCode,
  completeProfileEmailChange,
  findUserByEmail,
  findUserById,
  sendSmsVerificationCode,
  sendVerificationEmail,
  updateUser,
  verifyCode,
  verifyPassword,
  type AppUser,
} from '@/auth/users';
import {
  KEY_2FA_REQUIRED,
  KEY_2FA_CODE_SENT,
  KEY_2FA_CODE_AVAILABLE,
  SIGNUP_VERIFICATION_REQUESTED,
  parseTwoFactorResponse,
} from '@/auth';

const mockAuth = jest.fn();
const mockAfter = jest.fn();

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    auth: (...args: unknown[]) => mockAuth(...args),
    handlers: {},
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));
jest.mock('next-auth/providers/credentials', () => (options: unknown) => options);
jest.mock('next-auth/providers/google', () => ({}));
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (task: () => Promise<void>) => mockAfter(task),
}));
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  useRouter: () => ({}),
}));
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));
jest.mock('../src/app/path', () => ({
  PATH_ADMIN: '/admin',
  PATH_ADMIN_PHOTOS: '/admin/media',
  PATH_ROOT: '/',
  PATH_SIGN_IN: '/sign-in',
  PATH_PROFILE: '/profile',
  PATH_VERIFY_LOGIN: '/verify-login',
  isPathProtected: (pathname: string) => pathname.startsWith('/admin') ||
    pathname === '/verify-login',
}));
jest.mock('../src/app/config', () => ({}));
jest.mock('../src/app/AppState', () => ({ useAppState: () => ({}) }));
jest.mock('../src/auth/SignInForm', () => () => null);
jest.mock('../src/auth/google-link', () => ({
  beginGoogleAccountLink: jest.fn(),
  clearGoogleAccountLink: jest.fn(),
  getGoogleAccountLink: jest.fn(),
}));
jest.mock('../src/auth/CompleteSignInVerificationForm', () => () => null);
jest.mock('../src/auth/AuthPageShell', () => () => null);
jest.mock('../src/i18n/state/server', () => ({}));
jest.mock('../src/utility/usePrefersReducedMotion', () => () => true);
jest.mock('../src/auth/site-access', () => ({
  getSiteAccessSettingsForAuthorization: async () => ({
    siteVisibility: 'public',
    newRegistrationsEnabled: true,
    loginVerificationRequired: false,
  }),
}));
jest.mock('../src/auth/users', () => ({
  createSmsVerificationCode: jest.fn(),
  createVerificationCode: jest.fn(),
  completeProfileEmailChange: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  hasActiveSuperAdmin: async () => true,
  isEmail: (value: string) => value.includes('@'),
  sendVerificationEmail: jest.fn(),
  sendSmsVerificationCode: jest.fn(),
  updateUser: jest.fn(),
  verifyCode: jest.fn(),
  verifyPassword: jest.fn(),
}));

const pendingSession: Session = {
  expires: '',
  user: {
    id: 'account',
    status: 'active',
    role: 'superadmin',
    twoFactorPending: true,
  },
};
const verifiedSession: Session = {
  ...pendingSession,
  user: { ...pendingSession.user, twoFactorPending: false },
};
const destination = '/admin/media?page=2';
const routeAuthorization = (
  jest.mocked(NextAuth).mock.calls[0][0] as NextAuthConfig
).callbacks!.authorized!;
const googleCallback = (
  jest.mocked(NextAuth).mock.calls[0][0] as NextAuthConfig
).callbacks!.signIn!;
const originalResponseRedirect = Object.getOwnPropertyDescriptor(
  Response, 'redirect',
);

beforeAll(() => {
  Object.defineProperty(Response, 'redirect', {
    configurable: true,
    value: (url: string | URL) => new Response(null, {
      status: 302,
      headers: { Location: String(url) },
    }),
  });
});

afterAll(() => {
  if (originalResponseRedirect) {
    Object.defineProperty(Response, 'redirect', originalResponseRedirect);
  } else {
    Reflect.deleteProperty(Response, 'redirect');
  }
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAfter.mockClear();
  jest.mocked(findUserByEmail).mockReset();
  jest.mocked(createVerificationCode).mockReset().mockResolvedValue('123456');
  jest.mocked(sendVerificationEmail).mockReset().mockResolvedValue(undefined);
  jest.mocked(updateUser).mockReset();
  jest.mocked(verifyCode).mockReset();
  jest.mocked(completeProfileEmailChange).mockReset();
  jest.mocked(getGoogleAccountLink).mockReset();
  jest.mocked(clearGoogleAccountLink).mockClear();
});

it('rejects pending sessions in privileged action guards', async () => {
  mockAuth.mockResolvedValue(pendingSession);
  const privileged = jest.fn();
  await expect(runAuthenticatedAdminServerAction(privileged))
    .rejects.toThrow('Unauthorized');
  await expect(getUsersAction()).rejects.toThrow('Unauthorized');
  expect(privileged).not.toHaveBeenCalled();
});

it('requires completed verification in API session checks', async () => {
  mockAuth.mockResolvedValue(pendingSession);
  await expect(isSessionAuthorized('upload')).resolves.toBe(false);
  mockAuth.mockResolvedValue(verifiedSession);
  await expect(isSessionAuthorized('upload')).resolves.toBe(true);
});

it('keeps a pending session on the exact verification route', async () => {
  const request = new NextRequest('https://panel.example/verify-login');
  await expect(routeAuthorization({ auth: pendingSession, request }))
    .resolves.toBe(true);

  const otherPage = new NextRequest('https://panel.example/verify-login-other');
  const result = await routeAuthorization({
    auth: pendingSession,
    request: otherPage,
  }) as Response;
  expect(new URL(result.headers.get('location')!).pathname).toBe('/verify-login');
});

it('passes an existing callback through pending sign-in and verified MFA', async () => {
  const query = new URLSearchParams({ callbackUrl: destination });
  const pending = await routeAuthorization({
    auth: pendingSession,
    request: new NextRequest(`https://panel.example/sign-in?${query}`),
  }) as Response;
  const verificationUrl = new URL(pending.headers.get('location')!);
  expect(verificationUrl.pathname).toBe('/verify-login');
  expect(verificationUrl.searchParams.get('callbackUrl')).toBe(destination);

  const verified = await routeAuthorization({
    auth: verifiedSession,
    request: new NextRequest(verificationUrl),
  }) as Response;
  expect(verified.headers.get('location')).toBe(`https://panel.example${destination}`);
});

it('preserves the callback query through canonical admin navigation', async () => {
  const result = await routeAuthorization({
    auth: verifiedSession,
    request: new NextRequest('https://panel.example/admin?page=2'),
  }) as Response;
  expect(result.headers.get('location'))
    .toBe('https://panel.example/admin/media?page=2');
});

it.each([SignInPage, VerifyLoginPage])(
  'returns an already-verified auth page visitor to the requested destination',
  async (page) => {
    mockAuth.mockResolvedValue(verifiedSession);
    const searchParams = Promise.resolve({ callbackUrl: destination });
    await expect(page({ searchParams })).rejects.toMatchObject({
      digest: `NEXT_REDIRECT;replace;${destination};307;`,
    });
  },
);

it('falls back when the callback would reopen an authentication screen', async () => {
  mockAuth.mockResolvedValue(verifiedSession);
  const searchParams = Promise.resolve({ callbackUrl: '/verify-login' });
  await expect(SignInPage({ searchParams })).rejects.toMatchObject({
    digest: 'NEXT_REDIRECT;replace;/admin;307;',
  });
});

it('keeps SMS selectable after the initial email send fails', async () => {
  jest.mocked(verifyPassword).mockResolvedValue({
    id: 'account',
    email: 'account@example.com',
    twoFactorEnabled: true,
    mobileVerified: true,
    mobileNumber: '+94771234567',
  } as AppUser);
  jest.mocked(sendVerificationEmail).mockRejectedValueOnce(new Error('offline'));
  const form = new FormData();
  form.set('email', 'account@example.com');
  form.set('password', 'TestPassword1');

  expect(parseTwoFactorResponse(await signInAction(undefined, form))).toEqual({
    state: KEY_2FA_REQUIRED,
    preferred: 'email',
    available: ['email', 'sms'],
    error: expect.stringContaining('choose another verification method'),
  });
});

it('keeps email available and invalidates the stale step after failed SMS resend', async () => {
  const mobileNumber = '+94771234567';
  const user = {
    id: 'account', email: 'account@example.com', mobileVerified: true,
    mobileNumber, twoFactorEnabled: true,
  } as AppUser;
  mockAuth.mockResolvedValue(pendingSession);
  jest.mocked(findUserById).mockResolvedValueOnce(user);
  jest.mocked(createSmsVerificationCode)
    .mockResolvedValueOnce({ mobileNumber, code: '123456' });
  jest.mocked(sendSmsVerificationCode)
    .mockRejectedValueOnce(new Error('SMS unavailable'));
  const form = new FormData();
  form.set('twoFactorMethod', 'sms');
  form.set('intent', 'resend-2fa');
  form.set('twoFactorCode', '654321');

  const result = await completePendingSignInVerificationAction(undefined, form);
  expect(parseTwoFactorResponse(result)).toEqual({
    state: KEY_2FA_REQUIRED,
    preferred: 'sms',
    available: ['email', 'sms'],
    error: expect.stringContaining('choose another verification method'),
  });
});

it.each([undefined, 'resend-2fa'])(
  'keeps a previous code usable when login delivery is throttled (%p)', async intent => {
  jest.mocked(verifyPassword).mockResolvedValue({
    id: 'account', email: 'account@example.com', twoFactorEnabled: true,
  } as AppUser);
  jest.mocked(createVerificationCode)
    .mockRejectedValueOnce(new VerificationCodeCooldownError());
  const form = new FormData();
  form.set('email', 'account@example.com');
  form.set('password', 'TestPassword1');
  if (intent) { form.set('intent', intent); }

  expect(parseTwoFactorResponse(await signInAction(undefined, form))).toEqual({
    state: KEY_2FA_CODE_AVAILABLE,
    preferred: 'email',
    available: ['email'],
    error: expect.stringContaining('previous code may still work'),
  });
  expect(sendVerificationEmail).not.toHaveBeenCalled();
  },
);

it('returns a neutral resend response before looking up account state', async () => {
  const form = new FormData();
  form.set('email', 'pending@example.com');
  await expect(resendSignUpVerificationAction(undefined, form))
    .resolves.toBe(SIGNUP_VERIFICATION_REQUESTED);
  expect(findUserByEmail).not.toHaveBeenCalled();
  expect(sendVerificationEmail).not.toHaveBeenCalled();

  await mockAfter.mock.calls[0][0]();
  expect(findUserByEmail).toHaveBeenCalledWith('pending@example.com');
  expect(sendVerificationEmail).not.toHaveBeenCalled();

  jest.mocked(findUserByEmail).mockResolvedValue({
    id: 'account', email: 'pending@example.com', status: 'active',
    email_verified: false,
  } as Awaited<ReturnType<typeof findUserByEmail>>);
  await expect(resendSignUpVerificationAction(undefined, form))
    .resolves.toBe(SIGNUP_VERIFICATION_REQUESTED);
  await mockAfter.mock.calls[1][0]();
  expect(sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
    email: 'pending@example.com', purpose: 'signup',
  }));
});

it('replaces stale verification delivery status and clears the entered code', async () => {
  render(<VerifyEmailForm
    initialEmail="pending@example.com"
    initialDeliveryFailed
  />);
  expect(screen.getByRole('alert').textContent).toContain('could not be sent');
  const codeField = () => screen.getByLabelText<HTMLInputElement>('Verification code');
  fireEvent.change(codeField(), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Resend verification code' }));

  expect(await screen.findByText(SIGNUP_VERIFICATION_REQUESTED)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  await waitFor(() => expect(codeField().value).toBe(''));

  fireEvent.change(codeField(), { target: { value: '987654' } });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'different@example.com' },
  });
  expect(screen.queryByText(SIGNUP_VERIFICATION_REQUESTED)).toBeNull();
  expect(codeField().value).toBe('');
});

const profileEmail = 'current@example.com';
const requestedProfileEmail = 'new@example.com';
const emailChangeForm = () => {
  const form = new FormData();
  form.set('name', 'Current user');
  form.set('email', requestedProfileEmail);
  form.set('code', '123456');
  return form;
};

const mockProfileUser = (googleLinked = false) => {
  mockAuth.mockResolvedValue(verifiedSession);
  jest.mocked(findUserById).mockResolvedValue({
    id: verifiedSession.user!.id,
    name: 'Current user',
    email: profileEmail,
    googleLinked,
    emailVerified: true,
  } as AppUser);
};

it('keeps the old profile email until the new address is verified', async () => {
  mockProfileUser();
  await expect(saveProfileAction(undefined, emailChangeForm())).rejects.toMatchObject({
    digest: expect.stringContaining('purpose=email-change'),
  });
  expect(updateUser).toHaveBeenCalledWith('account', expect.not.objectContaining({
    email: requestedProfileEmail,
  }));
  expect(createVerificationCode).toHaveBeenCalledWith(
    'account', requestedProfileEmail, 'email-change',
  );
  expect(completeProfileEmailChange).not.toHaveBeenCalled();
});

it('keeps a Google-managed email read-only on the server', async () => {
  mockProfileUser(true);
  await expect(saveProfileAction(undefined, emailChangeForm()))
    .resolves.toBe('Your email address is managed by Google');
  expect(updateUser).not.toHaveBeenCalled();
  expect(createVerificationCode).not.toHaveBeenCalled();
});

it('requires a code issued for the current account before changing its email', async () => {
  mockProfileUser();
  jest.mocked(verifyCode).mockRejectedValueOnce(new Error('Verification code is invalid'));
  await expect(confirmProfileEmailChangeAction(undefined, emailChangeForm()))
    .resolves.toBe('Verification code is invalid');
  expect(completeProfileEmailChange).not.toHaveBeenCalled();

  jest.mocked(verifyCode).mockResolvedValueOnce('account');
  await expect(confirmProfileEmailChangeAction(undefined, emailChangeForm()))
    .rejects.toMatchObject({ digest: expect.stringContaining('/profile') });
  expect(verifyCode).toHaveBeenLastCalledWith(
    requestedProfileEmail, '123456', 'email-change', 'account',
  );
  expect(completeProfileEmailChange).toHaveBeenCalledWith(
    'account', profileEmail, requestedProfileEmail,
  );
});

it.each([
  ['another@example.com', true, 'account'],
  [profileEmail, false, 'account'],
  [profileEmail, true, 'other-account'],
] as const)('does not switch sessions while linking to %s', async (email, emailVerified, userId) => {
  jest.mocked(getGoogleAccountLink).mockResolvedValue({
    userId: 'account', email: profileEmail, expires: Date.now() + 60_000,
  });
  mockAuth.mockResolvedValue({
    ...verifiedSession, user: { ...verifiedSession.user, id: userId, email: profileEmail },
  });

  await expect(googleCallback({
    user: {},
    account: { provider: 'google', type: 'oidc', providerAccountId: 'google-id' },
    profile: { email, email_verified: emailVerified, sub: 'google-id' },
  })).resolves.toBe('/profile?googleLink=unmatched');
  expect(clearGoogleAccountLink).toHaveBeenCalledTimes(1);
});

it('accepts the matched verified Google email for the initiating session', async () => {
  jest.mocked(getGoogleAccountLink).mockResolvedValue({
    userId: 'account', email: profileEmail, expires: Date.now() + 60_000,
  });
  mockAuth.mockResolvedValue({
    ...verifiedSession, user: { ...verifiedSession.user, email: profileEmail },
  });

  await expect(googleCallback({
    user: {},
    account: { provider: 'google', type: 'oidc', providerAccountId: 'google-id' },
    profile: { email: profileEmail, email_verified: true, sub: 'google-id' },
  })).resolves.toBe(true);
  expect(clearGoogleAccountLink).not.toHaveBeenCalled();
});
