import {
  isPathProtected,
  PATH_ADMIN,
  PATH_ADMIN_PHOTOS,
  PATH_ACCESS_DENIED,
  PATH_OG,
  PATH_OG_SAMPLE,
  PATH_SETUP,
  PATH_VERIFY_LOGIN,
  PREFIX_TAG,
} from '@/app/path';
import NextAuth, { User } from 'next-auth';
import { NextResponse } from 'next/server';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import {
  AppUser,
  clearLoginVerificationChallenge,
  createLoginVerificationChallenge,
  ensureAuthTables,
  findUserByEmail,
  findUserByGoogleSub,
  findUserSessionStateById,
  hasActiveSuperAdmin,
  markTotpCounterUsed,
  upsertGoogleUser,
  verifyPassword,
  verifyCode,
  verifySmsCode,
} from './users';
import { verifyTotpCodeWithCounter } from './totp';
import {
  isDatabaseQuotaExceededError,
  normalizeDatabaseErrorMessage,
} from '@/db/errors';
import { hasCapability, type AuthCapability } from './permissions';
import {
  clearGoogleSuperAdminSetup,
  isGoogleSuperAdminSetup,
} from './google-setup';
import { isGoogleAuthConfigured } from './config';
import { getSiteAccessSettingsForAuthorization } from './site-access';
import { isPathAllowedWithoutSessionInPrivateMode } from './site-access-routes';
const toAuthUser = (user: AppUser): User & {
  id: string
  role: string
} => ({
  id: user.id,
  email: user.email,
  name: user.name,
  image: user.profileImageUrl,
  role: user.role,
  status: user.status,
  twoFactorPending: false,
});

const SESSION_MAX_AGE_SECONDS = 2 * 24 * 60 * 60;

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth({
  // Public mode keeps a normal, finite session; private mode additionally
  // enforces the client-side 30-minute inactivity timeout.
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email or username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        twoFactorCode: { label: '2FA code', type: 'text' },
        twoFactorMethod: { label: '2FA method', type: 'text' },
      },
      async authorize({ email, password, twoFactorCode, twoFactorMethod }) {
        await ensureAuthTables().catch(() => undefined);

        if (typeof email === 'string' && typeof password === 'string') {
          const user = await verifyPassword(email, password).catch(() => undefined);
          if (user) {
            const { loginVerificationRequired } =
              await getSiteAccessSettingsForAuthorization();
            if (!user.twoFactorEnabled && !loginVerificationRequired) {
              return toAuthUser(user);
            }
            if (typeof twoFactorCode !== 'string') { return null; }
            if (twoFactorMethod === 'sms') {
              if (!user.mobileVerified || !user.mobileNumber) { return null; }
              const verified = await verifySmsCode(
                  user.id,
                  user.mobileNumber,
                  twoFactorCode,
                  'login',
                )
                .then(() => true)
                .catch(() => false);
              if (!verified) { return null; }
            } else if (twoFactorMethod === 'authenticator') {
              if (!user.totpEnabled || !user.totpSecret) { return null; }
              const result = verifyTotpCodeWithCounter(
                user.totpSecret,
                twoFactorCode,
              );
              if (!result.valid || result.counter === null) { return null; }
              const used = await markTotpCounterUsed(user.id, result.counter);
              if (!used) { return null; }
            } else if (twoFactorMethod === 'email') {
              const verifiedUserId = await verifyCode(
                  user.email,
                  twoFactorCode,
                  'login',
                )
                .catch(() => undefined);
              if (verifiedUserId !== user.id) { return null; }
            } else {
              return null;
            }
          }
          if (user) { return toAuthUser(user); }
        }

        return null;
      },
    }),
    ...(isGoogleAuthConfigured() ? [Google] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') { return true; }
      const email = profile?.email;
      const googleSub = profile?.sub;
      if (!email || !googleSub) { return false; }
      if (!(await hasActiveSuperAdmin())) {
        return isGoogleSuperAdminSetup();
      }
      const existing = await findUserByGoogleSub(googleSub) ??
        await findUserByEmail(email);
      if (existing) { return existing.status !== 'disabled'; }
      const { newRegistrationsEnabled } =
        await getSiteAccessSettingsForAuthorization();
      return newRegistrationsEnabled;
    },
    async jwt({ token, user, account, profile }) {
      try {
        if (user) {
          token.id = user.id;
          token.role = 'role' in user ? user.role : 'user';
          token.twoFactorPending = 'twoFactorPending' in user
            ? Boolean(user.twoFactorPending)
            : false;
          token.status = 'status' in user ? user.status : 'active';
          token.loginVerificationNonce = undefined;
        }
        if (account?.provider === 'google' && profile?.sub && profile.email) {
          const allowInitialSuperAdmin = await isGoogleSuperAdminSetup();
          const { newRegistrationsEnabled } = allowInitialSuperAdmin
            ? { newRegistrationsEnabled: true }
            : await getSiteAccessSettingsForAuthorization();
          const appUser = await upsertGoogleUser({
            googleSub: profile.sub,
            email: profile.email,
            name: profile.name ?? profile.email.split('@')[0] ?? 'User',
            profileImageUrl: 'picture' in profile
              ? `${profile.picture ?? ''}` || undefined
              : undefined,
            allowInitialSuperAdmin,
            allowNewUser: newRegistrationsEnabled,
          });
          if (allowInitialSuperAdmin) {
            await clearGoogleSuperAdminSetup();
          }
          const loginVerificationNonce = appUser.twoFactorEnabled
            ? await createLoginVerificationChallenge(appUser.id)
            : undefined;
          if (!loginVerificationNonce) {
            await clearLoginVerificationChallenge(appUser.id);
          }
          token.id = appUser.id;
          token.role = appUser.role;
          token.status = appUser.status;
          token.picture = appUser.profileImageUrl;
          token.twoFactorPending = Boolean(loginVerificationNonce);
          token.loginVerificationNonce = loginVerificationNonce;
        }
        if (token.id) {
          const appUser = await findUserSessionStateById(token.id as string);
          if (!appUser || appUser.status !== 'active') {
            token.id = undefined;
            token.role = undefined;
            token.status = undefined;
            token.name = undefined;
            token.email = undefined;
            token.picture = undefined;
            token.twoFactorPending = false;
            token.loginVerificationNonce = undefined;
            return token;
          }
          token.role = appUser.role;
          token.status = appUser.status;
          token.name = appUser.name;
          token.email = appUser.email;
          token.picture = appUser.profileImageUrl;
          token.twoFactorPending = Boolean(
            token.loginVerificationNonce &&
            appUser.loginVerificationNonce === token.loginVerificationNonce,
          );
          if (!token.twoFactorPending) {
            token.loginVerificationNonce = undefined;
          }
        }
        return token;
      } catch (error) {
        if (isDatabaseQuotaExceededError(error)) {
          throw new Error(normalizeDatabaseErrorMessage(
            error,
            'Sign in is temporarily unavailable',
          ));
        }
        throw error;
      }
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.status = token.status as string;
        session.user.image = token.picture as string | null | undefined;
        session.user.twoFactorPending = Boolean(token.twoFactorPending);
      }
      return session;
    },
    async authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      if (pathname !== PATH_SETUP && !(await hasActiveSuperAdmin())) {
        return Response.redirect(new URL(PATH_SETUP, request.nextUrl));
      }

      const siteAccess = await getSiteAccessSettingsForAuthorization();
      const isPrivateModePublicPath =
        isPathAllowedWithoutSessionInPrivateMode(
          pathname,
          siteAccess.newRegistrationsEnabled,
        );
      const isUrlProtected = isPathProtected(pathname) || (
        siteAccess.siteVisibility === 'private' &&
        !isPrivateModePublicPath
      );
      const isUserLoggedIn = Boolean(
        auth?.user?.id && auth.user.status === 'active',
      );
      const isPendingTwoFactor = Boolean(auth?.user?.twoFactorPending);
      const isAdminPath = pathname.startsWith('/admin');
      const isVerifyLoginPath = pathname.startsWith(PATH_VERIFY_LOGIN);
      const isAdmin = hasCapability(auth?.user?.role, 'edit');
      if (isPendingTwoFactor && !isVerifyLoginPath) {
        return pathname.startsWith('/api/')
          ? Response.json(
            { error: 'Sign-in verification required' },
            { status: 401 },
          )
          : Response.redirect(new URL(PATH_VERIFY_LOGIN, request.nextUrl));
      }
      if (isUserLoggedIn && !isPendingTwoFactor && isVerifyLoginPath) {
        return Response.redirect(new URL(PATH_ADMIN, request.nextUrl));
      }
      if (isAdminPath && isUserLoggedIn && !isAdmin) {
        return Response.redirect(new URL(PATH_ACCESS_DENIED, request.nextUrl));
      }
      const isAllowed = !isUrlProtected || (
        isAdminPath ? isAdmin : isUserLoggedIn
      );
      if (!isAllowed) {
        return pathname.startsWith('/api/')
          ? Response.json({ error: 'Unauthorized' }, { status: 401 })
          : false;
      }
      if (pathname === PATH_ADMIN) {
        return Response.redirect(new URL(PATH_ADMIN_PHOTOS, request.nextUrl));
      }
      if (pathname === PATH_OG) {
        return Response.redirect(new URL(PATH_OG_SAMPLE, request.nextUrl));
      }
      const photoAlias = pathname.match(/^\/photos\/(.+)$/);
      if (photoAlias?.[1]) {
        return NextResponse.rewrite(new URL(
          `/${photoAlias[1]}`,
          request.nextUrl,
        ));
      }
      const tagAlias = pathname.match(/^\/t\/(.+)$/);
      if (tagAlias?.[1]) {
        return NextResponse.rewrite(new URL(
          `${PREFIX_TAG}/${tagAlias[1]}`,
          request.nextUrl,
        ));
      }
      return true;
    },
  },
  pages: {
    signIn: '/sign-in',
  },
});

export const runAuthenticatedAdminServerAction = async <T>(
  callback: () => T,
  capability: AuthCapability = 'edit',
): Promise<T> => {
  const session = await auth();
  const isAllowed = hasCapability(session?.user?.role, capability);
  if (isAllowed && session?.user?.status === 'active') {
    return callback();
  } else {
    throw new Error('Unauthorized server action request');
  }
};
