import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { PATH_PROFILE } from '@/app/path';

const GOOGLE_LINK_COOKIE = 'media-panel-google-link';
const OAUTH_CALLBACK_COOKIES = ['__Secure-authjs.callback-url', 'authjs.callback-url'];
export const GOOGLE_LINK_CALLBACK = `${PATH_PROFILE}?googleLink=pending`;
// Keep the intent available for the lifetime of Auth.js's OAuth checks.
const INTENT_LIFETIME_SECONDS = 20 * 60;

type GoogleLinkIntent = { userId: string; email: string; expires: number };

const signingSecret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
const signatureFor = (encoded: string, secret: string) =>
  createHmac('sha256', secret).update(`google-link:${encoded}`).digest('base64url');

export const beginGoogleAccountLink = async (userId: string, email: string) => {
  const secret = signingSecret();
  if (!secret) { throw new Error('Authentication secret is not configured'); }
  const payload: GoogleLinkIntent = {
    userId,
    email: email.trim().toLowerCase(),
    expires: Date.now() + INTENT_LIFETIME_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  (await cookies()).set(GOOGLE_LINK_COOKIE, `${encoded}.${signatureFor(encoded, secret)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INTENT_LIFETIME_SECONDS,
  });
};

export const getGoogleAccountLink = async (): Promise<GoogleLinkIntent | null | undefined> => {
  const cookieJar = await cookies();
  const value = cookieJar.get(GOOGLE_LINK_COOKIE)?.value;
  if (value === undefined) {
    // Auth.js persists its callback URL with the OAuth transaction. Treat a
    // linking callback that lost its intent as a rejection, never a sign-in.
    return OAUTH_CALLBACK_COOKIES.some(name => cookieJar.get(name)?.value.endsWith(
      GOOGLE_LINK_CALLBACK,
    )) ? null : undefined;
  }
  const secret = signingSecret();
  const [encoded, signature, extra] = value.split('.');
  if (!secret || !encoded || !signature || extra !== undefined) { return null; }
  const expected = signatureFor(encoded, secret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)) { return null; }
  try {
    const intent = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as GoogleLinkIntent;
    return intent.expires > Date.now() ? intent : null;
  } catch {
    return null;
  }
};

export const clearGoogleAccountLink = async () => {
  const cookieJar = await cookies();
  cookieJar.set(GOOGLE_LINK_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  for (const name of OAUTH_CALLBACK_COOKIES) {
    if (!cookieJar.get(name)?.value.endsWith(GOOGLE_LINK_CALLBACK)) { continue; }
    cookieJar.set(name, '', {
      httpOnly: true, sameSite: 'lax', secure: name.startsWith('__Secure-'),
      path: '/', maxAge: 0,
    });
  }
};
