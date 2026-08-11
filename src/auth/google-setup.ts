import crypto from 'crypto';
import { cookies } from 'next/headers';

const GOOGLE_SETUP_COOKIE = 'media-panel-google-setup';
const GOOGLE_SETUP_TTL_SECONDS = 10 * 60;

const getSigningSecret = () =>
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';

const sign = (payload: string) => crypto
  .createHmac('sha256', getSigningSecret())
  .update(payload)
  .digest('base64url');

export const beginGoogleSuperAdminSetup = async () => {
  if (!getSigningSecret()) {
    throw new Error('Authentication secret is not configured');
  }
  const expiresAt = Math.floor(Date.now() / 1000) + GOOGLE_SETUP_TTL_SECONDS;
  const payload = `${expiresAt}.${crypto.randomUUID()}`;
  const value = `${payload}.${sign(payload)}`;
  (await cookies()).set(GOOGLE_SETUP_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GOOGLE_SETUP_TTL_SECONDS,
  });
};

export const isGoogleSuperAdminSetup = async () => {
  const value = (await cookies()).get(GOOGLE_SETUP_COOKIE)?.value;
  const secret = getSigningSecret();
  if (!value || !secret) { return false; }
  const [expiresAtText, nonce, signature] = value.split('.');
  const payload = `${expiresAtText}.${nonce}`;
  const expected = sign(payload);
  if (!expiresAtText || !nonce || !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }
  const expiresAt = Number(expiresAtText);
  return Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
};

export const clearGoogleSuperAdminSetup = async () => {
  (await cookies()).set(GOOGLE_SETUP_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
};
