import {
  isPathProtected,
  PATH_ADMIN,
  PATH_ADMIN_PHOTOS,
  PATH_ACCESS_DENIED,
  PATH_OG,
  PATH_OG_SAMPLE,
  PATH_PROFILE,
  PATH_ROOT,
  PATH_SIGN_IN,
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
import { getLoginVerificationNonceState } from './login-verification';
import { KEY_CALLBACK_URL } from './index';
import { getAuthCallbackPath, pathForAuthCallback } from './redirects';
import { isVerifiedSession } from './session';
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
import { clearGoogleAccountLink, getGoogleAccountLink } from './google-link';
import { getSiteAccessSettingsForAuthorization } from './site-access';
import { isPathAllowedWithoutSessionInPrivateMode } from './site-access-routes';
import {
  createLocalAuditSession,
  isLocalAuthBypassRequested,
} from './local-audit-bypass';
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

const nextAuth = NextAuth({
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
      const link = await getGoogleAccountLink();
      if (link !== undefined) {
        const session = link && await auth();
        if (link && email?.trim().toLowerCase() === link.email &&
            googleSub && profile?.email_verified === true &&
            isVerifiedSession(session) && session.user.id === link.userId &&
            session.user.email?.trim().toLowerCase() === link.email) {
          return true;
        }
        await clearGoogleAccountLink();
        return `${PATH_PROFILE}?googleLink=unmatched`;
      }
      if (!email || !googleSub || profile?.email_verified !== true) { return false; }
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
          const link = await getGoogleAccountLink();
          if (link === null) { throw new Error('Google account linking expired'); }
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
            expectedLinkUserId: link?.userId,
          });
          if (link) { await clearGoogleAccountLink(); }
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
          const nonceState = getLoginVerificationNonceState(
            typeof token.loginVerificationNonce === 'string'
              ? token.loginVerificationNonce
              : undefined,
            appUser.loginVerificationNonce,
          );
          if (nonceState === 'superseded') {
            token.id = undefined;
            token.sub = undefined;
            token.role = undefined;
            token.status = undefined;
            token.name = undefined;
            token.email = undefined;
            token.picture = undefined;
            token.twoFactorPending = false;
            token.loginVerificationNonce = undefined;
            return token;
          }
          token.twoFactorPending = nonceState === 'pending';
          if (nonceState !== 'pending') { token.loginVerificationNonce = undefined; }
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
      const { pathname, search } = request.nextUrl;
      const aliasUrl = (path: string) => {
        const url = new URL(request.nextUrl.href);
        url.pathname = path;
        return url;
      };
      const photoAlias = pathname.match(/^\/photos\/([^/]+)$/);
      const photoAliasDestination = photoAlias?.[1]
        ? `/${photoAlias[1]}`
        : undefined;
      const tagAlias = pathname.match(/^\/t\/([^/]+)$/);
      const tagAliasDestination = tagAlias?.[1]
        ? `${PREFIX_TAG}/${tagAlias[1]}`
        : undefined;

      if (isLocalAuthBypassRequested()) {
        if (pathname === PATH_ADMIN) {
          return Response.redirect(aliasUrl(PATH_ADMIN_PHOTOS));
        }
        if (pathname === PATH_OG) {
          return Response.redirect(aliasUrl(PATH_OG_SAMPLE));
        }
        if (photoAliasDestination) {
          if (photoAliasDestination === PATH_ADMIN ||
              photoAliasDestination.startsWith(`${PATH_ADMIN}/`) ||
              photoAliasDestination === '/api' ||
              photoAliasDestination.startsWith('/api/')) {
            return Response.json(
              { error: 'Admin pages are disabled in local audit mode' },
              { status: 403 },
            );
          }
          return NextResponse.rewrite(aliasUrl(photoAliasDestination));
        }
        if (tagAliasDestination) {
          if (tagAliasDestination === `${PREFIX_TAG}/private` ||
              tagAliasDestination.startsWith(`${PREFIX_TAG}/private/`)) {
            return Response.json(
              { error: 'Private media is unavailable in local audit mode' },
              { status: 403 },
            );
          }
          return NextResponse.rewrite(aliasUrl(tagAliasDestination));
        }
        return true;
      }

      if (pathname !== PATH_SETUP && !(await hasActiveSuperAdmin())) {
        return Response.redirect(new URL(PATH_SETUP, request.nextUrl));
      }

      const siteAccess = await getSiteAccessSettingsForAuthorization();
      const authorizationPath = photoAliasDestination ??
        tagAliasDestination ?? pathname;
      const isPrivateModePublicPath =
        isPathAllowedWithoutSessionInPrivateMode(
          authorizationPath,
          siteAccess.newRegistrationsEnabled,
        );
      const isUrlProtected = isPathProtected(authorizationPath) || (
        siteAccess.siteVisibility === 'private' &&
        !isPrivateModePublicPath
      );
      const isUserLoggedIn = Boolean(
        auth?.user?.id && auth.user.status === 'active',
      );
      const isPendingTwoFactor = Boolean(auth?.user?.twoFactorPending);
      const isAdminPath = authorizationPath === PATH_ADMIN ||
        authorizationPath.startsWith(`${PATH_ADMIN}/`);
      const isVerifyLoginPath = pathname === PATH_VERIFY_LOGIN;
      const isAdmin = hasCapability(auth?.user?.role, 'edit');
      const callback = pathname === PATH_SIGN_IN || isVerifyLoginPath
        ? getAuthCallbackPath(request.nextUrl.searchParams.get(KEY_CALLBACK_URL))
        : getAuthCallbackPath(`${pathname}${search}`);
      if (isPendingTwoFactor && !isVerifyLoginPath) {
        return pathname.startsWith('/api/')
          ? Response.json(
            { error: 'Sign-in verification required' },
            { status: 401 },
          )
          : Response.redirect(new URL(
            pathForAuthCallback(PATH_VERIFY_LOGIN, callback),
            request.nextUrl,
          ));
      }
      if (isUserLoggedIn && !isPendingTwoFactor && isVerifyLoginPath) {
        const fallback = auth?.user?.role === 'user'
          ? PATH_ROOT
          : PATH_ADMIN;
        return Response.redirect(new URL(callback ?? fallback, request.nextUrl));
      }
      if (isAdminPath && isUserLoggedIn && !isAdmin) {
        return Response.redirect(new URL(PATH_ACCESS_DENIED, request.nextUrl));
      }
      const isAllowed = !isUrlProtected || (
        isAdminPath ? isAdmin : isUserLoggedIn
      );
      if (!isAllowed) {
        if (pathname.startsWith('/api/')) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return Response.redirect(new URL(
          pathForAuthCallback(PATH_SIGN_IN, callback),
          request.nextUrl,
        ));
      }
      if (pathname === PATH_ADMIN) {
        return Response.redirect(aliasUrl(PATH_ADMIN_PHOTOS));
      }
      if (pathname === PATH_OG) {
        return Response.redirect(aliasUrl(PATH_OG_SAMPLE));
      }
      if (photoAliasDestination) {
        return NextResponse.rewrite(aliasUrl(photoAliasDestination));
      }
      if (tagAliasDestination) {
        return NextResponse.rewrite(aliasUrl(tagAliasDestination));
      }
      return true;
    },
  },
  pages: {
    signIn: '/sign-in',
  },
});

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
} = nextAuth;

const nextAuthAuth = nextAuth.auth;
export const auth = ((...args: unknown[]) => {
  if (isLocalAuthBypassRequested() && args.length === 0) {
    return Promise.resolve(createLocalAuditSession());
  }
  return Reflect.apply(nextAuthAuth, undefined, args);
}) as typeof nextAuthAuth;

export const runAuthenticatedAdminServerAction = async <T>(
  callback: () => T,
  capability: AuthCapability = 'edit',
): Promise<T> => {
  const session = await auth();
  if (isVerifiedSession(session) && hasCapability(session.user.role, capability)) {
    return callback();
  } else {
    throw new Error('Unauthorized server action request');
  }
};
