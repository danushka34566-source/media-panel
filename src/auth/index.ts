import { deleteCookie, getCookie, storeCookie } from '@/utility/cookie';

export const KEY_CREDENTIALS_SIGN_IN_ERROR = 'CredentialsSignin';
export const KEY_CREDENTIALS_SIGN_IN_ERROR_URL =
  'https://errors.authjs.dev#credentialssignin';
export const KEY_CREDENTIALS_CALLBACK_ROUTE_ERROR_URL =
  'https://errors.authjs.dev#callbackrouteerror';
export const KEY_CREDENTIALS_SUCCESS = 'success';
export const KEY_2FA_REQUIRED = '2FA_REQUIRED';
export const KEY_2FA_CODE_SENT = '2FA_CODE_SENT';
export const KEY_2FA_CODE_AVAILABLE = '2FA_CODE_AVAILABLE';
export const KEY_CALLBACK_URL = 'callbackUrl';
export const AUTH_CODE_TTL_MINUTES = 5;
export const AUTH_CODE_RESEND_COOLDOWN_SECONDS = 60;
export const SIGNUP_VERIFICATION_REQUESTED =
  'If this address needs verification, check your email for a code. ' +
  'Wait a minute before requesting another.';

export type TwoFactorMethod = 'authenticator' | 'email' | 'sms';

export const buildTwoFactorResponse = (
  state: typeof KEY_2FA_REQUIRED |
    typeof KEY_2FA_CODE_SENT |
    typeof KEY_2FA_CODE_AVAILABLE,
  preferred: TwoFactorMethod,
  available: TwoFactorMethod[],
  error?: string,
) => `${state}:${preferred}:${available.join(',')}${error ? `:${error}` : ''}`;

export const parseTwoFactorResponse = (response?: string) => {
  if (!response?.startsWith(`${KEY_2FA_REQUIRED}:`) &&
      !response?.startsWith(`${KEY_2FA_CODE_SENT}:`) &&
      !response?.startsWith(`${KEY_2FA_CODE_AVAILABLE}:`)) {
    return undefined;
  }
  const [state, preferred, methods = '', ...errorParts] = response.split(':');
  const error = errorParts.join(':');
  return {
    state,
    preferred: preferred as TwoFactorMethod,
    available: methods.split(',').filter(Boolean) as TwoFactorMethod[],
    ...(error && { error }),
  };
};

const KEY_AUTH_EMAIL = 'authjs.email';

export const storeAuthEmailCookie = (email: string) =>
  storeCookie(KEY_AUTH_EMAIL, email);

export const getAuthEmailCookie = () =>
  getCookie(KEY_AUTH_EMAIL);

export const hasAuthEmailCookie = () =>
  Boolean(getCookie(KEY_AUTH_EMAIL));

export const clearAuthEmailCookie = () =>
  deleteCookie(KEY_AUTH_EMAIL);

export const isCredentialsSignInError = (error?: any) =>
  (error?.message || `${error}`).includes(KEY_CREDENTIALS_SIGN_IN_ERROR);

export const generateAuthSecret = () => fetch(
  'https://generate-secret.vercel.app/32',
  { cache: 'no-cache' },
).then(res => res.text());
