'use server';

import {
  auth,
  signIn,
  signOut,
} from '@/auth/server';
import type { Session } from 'next-auth';
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import {
  generateAuthSecret,
  KEY_CALLBACK_URL,
  KEY_CREDENTIALS_CALLBACK_ROUTE_ERROR_URL,
  KEY_CREDENTIALS_SIGN_IN_ERROR,
  KEY_CREDENTIALS_SIGN_IN_ERROR_URL,
  KEY_CREDENTIALS_SUCCESS,
  KEY_2FA_REQUIRED,
  KEY_2FA_CODE_SENT,
  buildTwoFactorResponse,
  type TwoFactorMethod,
} from '.';
import {
  createUser,
  createInitialSuperAdmin,
  createVerificationCode,
  createSmsVerificationCode,
  clearLoginVerificationChallenge,
  deleteUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  getActiveUserFavoriteMediaIds,
  getUserFavoriteMediaIds,
  getUsersPage,
  searchUsers,
  isUserFavorite,
  setUserFavorite,
  hasActiveSuperAdmin,
  AUTH_USERS_CACHE_TAG,
  isEmail,
  isStrongPassword,
  isUsername,
  markTotpCounterUsed,
  normalizeSriLankaMobile,
  sendSmsVerificationCode,
  sendVerificationEmail,
  updateUser,
  type UserRole,
  type UserStatus,
  type VideoPreviewMode,
  type AppUser,
  verifyPassword,
  verifySmsCode,
  verifyCode,
} from './users';
import { SORT_BY_OPTIONS, type SortBy } from '@/media/sort';
import { canManageRole, hasCapability, isUserRole } from './permissions';
import {
  PATH_ADMIN,
  PATH_ADMIN_USERS,
  PATH_PROFILE,
  PATH_ROOT,
  PATH_SIGN_IN,
  PATH_SETUP,
} from '@/app/path';
import {
  buildTotpUri,
  generateTotpSecret,
  getTotpIssuerFromDomain,
  verifyTotpCodeWithCounter,
} from './totp';
import { BASE_URL } from '@/app/config';
import {
  beginGoogleSuperAdminSetup,
  clearGoogleSuperAdminSetup,
} from './google-setup';
import {
  isDatabaseQuotaExceededError,
  normalizeDatabaseErrorMessage,
} from '@/db/errors';
import { isGoogleAuthConfigured } from './config';
import { getSiteAccessSettingsForAuthorization } from './site-access';

const requireGoogleAuth = () => {
  if (!isGoogleAuthConfigured()) {
    throw new Error('Google sign-in is not configured');
  }
};

export const signInAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const identifier = formValue(formData, 'email');
    const password = formValue(formData, 'password');
    const shouldResendTwoFactorCode =
      formValue(formData, 'intent') === 'resend-2fa';
    const twoFactorCode = shouldResendTwoFactorCode
      ? ''
      : formValue(formData, 'twoFactorCode');
    const requestedTwoFactorMethod = formValue(formData, 'twoFactorMethod');
    const dbUser = await verifyPassword(identifier, password);
    const loginVerificationRequired = dbUser
      ? (await getSiteAccessSettingsForAuthorization())
        .loginVerificationRequired
      : false;
    if (dbUser && (dbUser.twoFactorEnabled || loginVerificationRequired)) {
      const available: TwoFactorMethod[] = [
        ...(dbUser.totpEnabled ? ['authenticator' as const] : []),
        'email',
        ...(dbUser.mobileVerified && dbUser.mobileNumber
          ? ['sms' as const]
          : []),
      ];
      const preferred: TwoFactorMethod = dbUser.totpEnabled
        ? 'authenticator'
        : 'email';
      const twoFactorMethod = (
        requestedTwoFactorMethod || preferred
      ) as TwoFactorMethod;
      if (!twoFactorCode) {
        if (twoFactorMethod === 'sms') {
          if (!dbUser.mobileVerified || !dbUser.mobileNumber) {
            return buildTwoFactorResponse(
              KEY_2FA_REQUIRED,
              preferred,
              available,
            );
          }
          const sms = await createSmsVerificationCode(
            dbUser.id,
            dbUser.mobileNumber,
            'login',
          );
          await sendSmsVerificationCode({
            ...sms,
            userId: dbUser.id,
            purpose: 'login',
          });
          return buildTwoFactorResponse(
            KEY_2FA_CODE_SENT,
            twoFactorMethod,
            available,
          );
        }
        if (twoFactorMethod === 'email') {
          const code = await createVerificationCode(
            dbUser.id,
            dbUser.email,
            'login',
          );
          await sendVerificationEmail({
            userId: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            code,
            purpose: 'login',
          });
          return buildTwoFactorResponse(
            KEY_2FA_CODE_SENT,
            twoFactorMethod,
            available,
          );
        }
        return buildTwoFactorResponse(
          KEY_2FA_REQUIRED,
          preferred,
          available,
        );
      }
    }
    await signIn('credentials', Object.fromEntries(formData));
  } catch (error) {
    if (
      `${error}`.includes(KEY_CREDENTIALS_SIGN_IN_ERROR) || 
      `${error}`.includes(KEY_CREDENTIALS_SIGN_IN_ERROR_URL) ||
      // New error thrown in next-auth 5.0.0-beta.19 for incorrect credentials
      `${error}`.includes(KEY_CREDENTIALS_CALLBACK_ROUTE_ERROR_URL)
    ) {
      // Return credentials error to display on sign-in page.
      return KEY_CREDENTIALS_SIGN_IN_ERROR;
    } else if (isDatabaseQuotaExceededError(error)) {
      return normalizeDatabaseErrorMessage(
        error,
        'Sign in is temporarily unavailable',
      );
    } else if (!`${error}`.includes('NEXT_REDIRECT')) {
      console.log('Unknown sign in error:', {
        errorText: `${error}`,
        error,
      });
      // Rethrow non-redirect errors
      throw error;
    }
  }
  const callbackUrl = formValue(formData, KEY_CALLBACK_URL);
  if (callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
    redirect(callbackUrl);
  }
  return KEY_CREDENTIALS_SUCCESS;
};

export const signOutAction = async () => {
  await signOut({ redirect: false, redirectTo: PATH_ROOT });
};

export const getAuthAction = async () => {
  const session = await auth();
  return session?.user?.status === 'active' ? session : null;
};

export const setupSuperAdminAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const name = formValue(formData, 'name');
    const email = formValue(formData, 'email');
    const username = formValue(formData, 'username');
    const password = formValue(formData, 'password');
    const confirmPassword = formValue(formData, 'confirmPassword');
    if (!name || !email || !password) {
      return 'Name, email, and password are required';
    }
    if (!isEmail(email)) { return 'Enter a valid email address'; }
    if (username && !isUsername(username)) { return 'Enter a valid username'; }
    if (!isStrongPassword(password)) {
      return 'Use 8+ characters with uppercase, lowercase, and a number';
    }
    if (password !== confirmPassword) { return 'Passwords do not match'; }
    await createInitialSuperAdmin({ name, email, username, password });
    await signIn('credentials', {
      email,
      password,
      redirectTo: PATH_ADMIN,
    });
  } catch (error) {
    if (`${error}`.includes('NEXT_REDIRECT')) { throw error; }
    if (`${error}`.includes('Setup has already been completed')) {
      redirect(PATH_SIGN_IN);
    }
    return errorMessage(error, 'Unable to complete setup');
  }
};

export const getSetupRequiredAction = async () => !(await hasActiveSuperAdmin());

export const getWideGridPreferenceAction = async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) { return null; }
  const user = await findUserById(userId);
  return user?.wideGridEnabled ?? null;
};

export const setWideGridPreferenceAction = async (enabled: boolean) => {
  if (typeof enabled !== 'boolean') {
    throw new Error('Invalid grid preference');
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) { return; }
  await updateUser(userId, { wideGridEnabled: enabled });
};

export const getVideoPreviewPreferenceAction = async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) { return null; }
  const user = await findUserById(userId);
  return user?.videoPreviewMode ?? 'smart';
};

export const setVideoPreviewPreferenceAction = async (mode: VideoPreviewMode) => {
  if (!['off', 'smart', 'all'].includes(mode)) {
    throw new Error('Invalid video preview preference');
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) { return; }
  await updateUser(userId, { videoPreviewMode: mode });
};

const isSortBy = (value: unknown): value is SortBy =>
  SORT_BY_OPTIONS.some(option => option.sortBy === value);

export const getMediaSortPreferenceAction = async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) { return null; }
  const user = await findUserById(userId);
  return user?.mediaSortBy ?? null;
};

export const setMediaSortPreferenceAction = async (sortBy: SortBy) => {
  if (!isSortBy(sortBy)) {
    throw new Error('Invalid media sort preference');
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) { return; }
  await updateUser(userId, { mediaSortBy: sortBy });
};

export const logClientAuthUpdate = async (data: Session | null | undefined) =>
  console.log('Client auth update', data);

export const generateAuthSecretAction = async () => generateAuthSecret();

const formValue = (formData: FormData, key: string) =>
  `${formData.get(key) ?? ''}`.trim();

const errorMessage = (error: unknown, fallback: string) =>
  normalizeDatabaseErrorMessage(error, fallback);

export const signUpAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
    const { newRegistrationsEnabled } =
      await getSiteAccessSettingsForAuthorization();
    if (!newRegistrationsEnabled) {
      return 'New account registrations are disabled';
    }
    const name = formValue(formData, 'name');
    const email = formValue(formData, 'email').toLowerCase();
    const username = formValue(formData, 'username');
    const password = formValue(formData, 'password');
    if (!name || !email || !username || !password) {
      return 'Name, email, username and password are required';
    }
    if (!isEmail(email)) { return 'Enter a valid email address'; }
    if (!isUsername(username)) {
      return 'Use 3-30 letters, numbers, dots, dashes or underscores';
    }
    if (!isStrongPassword(password)) {
      return 'Use 8+ characters with uppercase, lowercase and a number';
    }

    const user = await createUser({ name, email, username, password });
    const code = await createVerificationCode(user.id, user.email, 'signup');
    await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
      code,
      purpose: 'signup',
    });
    redirect(`/verify-email?email=${encodeURIComponent(user.email)}`);
  } catch (error) {
    if (`${error}`.includes('NEXT_REDIRECT')) { throw error; }
    return errorMessage(error, 'Unable to create account');
  }
};

export const verifyEmailAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
    const email = formValue(formData, 'email').toLowerCase();
    const code = formValue(formData, 'code');
    const userId = await verifyCode(email, code, 'signup');
    await updateUser(userId, { emailVerified: true });
    await signIn('credentials', {
      email,
      password: formValue(formData, 'password'),
      redirect: false,
    }).catch(() => undefined);
    redirect(PATH_SIGN_IN);
  } catch (error) {
    if (`${error}`.includes('NEXT_REDIRECT')) { throw error; }
    return errorMessage(error, 'Unable to verify email');
  }
};

export const requestPasswordResetAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
    const email = formValue(formData, 'email').toLowerCase();
    if (!isEmail(email)) { return 'Enter a valid email address'; }
    const user = await findUserByEmail(email);
    if (!user) { return 'No account found for that email'; }
    const code = await createVerificationCode(user.id, user.email, 'password-reset');
    await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
      code,
      purpose: 'password-reset',
    });
    redirect(`/password-reset?email=${encodeURIComponent(user.email)}&sent=1`);
  } catch (error) {
    if (`${error}`.includes('NEXT_REDIRECT')) { throw error; }
    return errorMessage(error, 'Unable to send reset code');
  }
};

export const confirmPasswordResetAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
    const email = formValue(formData, 'email').toLowerCase();
    const code = formValue(formData, 'code');
    const password = formValue(formData, 'password');
    if (!isStrongPassword(password)) {
      return 'Use 8+ characters with uppercase, lowercase and a number';
    }
    const userId = await verifyCode(email, code, 'password-reset');
    await updateUser(userId, {
      password,
      emailVerified: true,
    });
    redirect(PATH_SIGN_IN);
  } catch (error) {
    if (`${error}`.includes('NEXT_REDIRECT')) { throw error; }
    return errorMessage(error, 'Unable to reset password');
  }
};

export const signInWithGoogleAction = async () => {
  requireGoogleAuth();
  await signIn('google', { redirectTo: PATH_ROOT });
};

export const setupWithGoogleAction = async () => {
  requireGoogleAuth();
  if (await hasActiveSuperAdmin()) { redirect(PATH_SIGN_IN); }
  await beginGoogleSuperAdminSetup();
  try {
    await signIn('google', { redirectTo: PATH_ROOT });
  } catch (error) {
    if (`${error}`.includes('NEXT_REDIRECT')) { throw error; }
    await clearGoogleSuperAdminSetup();
    throw error;
  }
};

export const linkGoogleAccountAction = async () => {
  requireGoogleAuth();
  await signIn('google', { redirectTo: PATH_PROFILE });
};

export const unlinkGoogleAccountAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const user = await getCurrentUser();
    if (!user) { return 'Profile is only available for database users'; }
    if (!user.googleLinked) { return 'Google is not linked to this account'; }

    if (user.hasPassword) {
      const currentPassword = formValue(formData, 'currentPassword');
      const verified = currentPassword
        ? await verifyPassword(user.email, currentPassword)
        : undefined;
      if (!verified) { return 'Enter your current password to unlink Google'; }
    } else {
      const newPassword = formValue(formData, 'newPassword');
      const confirmPassword = formValue(formData, 'confirmPassword');
      if (!isStrongPassword(newPassword)) {
        return 'Add a password with 8+ characters, upper, lower, and a number';
      }
      if (newPassword !== confirmPassword) { return 'Passwords do not match'; }
      await updateUser(user.id, { password: newPassword });
    }

    await updateUser(user.id, {
      googleLinked: false,
      googleSub: null,
    });
    revalidatePath(PATH_PROFILE);
    return 'SAVED';
  } catch (error) {
    return errorMessage(error, 'Unable to unlink Google account');
  }
};

export const completePendingSignInVerificationAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const user = await getCurrentUser();
    const session = await auth();
    if (!user || !session?.user?.twoFactorPending) {
      return 'No pending login verification';
    }
    const twoFactorCode = formValue(formData, 'twoFactorCode');
    const available: TwoFactorMethod[] = [
      ...(user.totpEnabled ? ['authenticator' as const] : []),
      'email',
      ...(user.mobileVerified && user.mobileNumber ? ['sms' as const] : []),
    ];
    const preferred: TwoFactorMethod = user.totpEnabled
      ? 'authenticator'
      : 'email';
    const twoFactorMethod = (
      formValue(formData, 'twoFactorMethod') || preferred
    ) as TwoFactorMethod;
    if (!twoFactorCode) {
      if (twoFactorMethod === 'sms') {
        if (!user.mobileVerified || !user.mobileNumber) {
          return 'Add and verify a mobile number first';
        }
        const sms = await createSmsVerificationCode(
          user.id,
          user.mobileNumber,
          'login',
        );
        await sendSmsVerificationCode({
          ...sms,
          userId: user.id,
          purpose: 'login',
        });
        return buildTwoFactorResponse(
          KEY_2FA_CODE_SENT,
          twoFactorMethod,
          available,
        );
      }
      if (twoFactorMethod === 'email') {
        const code = await createVerificationCode(
          user.id,
          user.email,
          'login',
        );
        await sendVerificationEmail({
          userId: user.id,
          email: user.email,
          name: user.name,
          code,
          purpose: 'login',
        });
        return buildTwoFactorResponse(
          KEY_2FA_CODE_SENT,
          twoFactorMethod,
          available,
        );
      }
      return buildTwoFactorResponse(
        KEY_2FA_REQUIRED,
        preferred,
        available,
      );
    }
    if (twoFactorMethod === 'sms') {
      if (!user.mobileVerified || !user.mobileNumber) {
        return 'Add and verify a mobile number first';
      }
      await verifySmsCode(user.id, user.mobileNumber, twoFactorCode, 'login');
    } else if (twoFactorMethod === 'authenticator') {
      if (!user.totpEnabled || !user.totpSecret) {
        return 'Set up an authenticator app first';
      }
      const result = verifyTotpCodeWithCounter(user.totpSecret, twoFactorCode);
      if (!result.valid || result.counter === null) {
        return 'Authenticator code is invalid';
      }
      const used = await markTotpCounterUsed(user.id, result.counter);
      if (!used) {
        return 'Authenticator code was already used';
      }
    } else {
      const verifiedUserId = await verifyCode(user.email, twoFactorCode, 'login');
      if (verifiedUserId !== user.id) {
        return 'Verification code is invalid';
      }
    }
    await clearLoginVerificationChallenge(
      user.id,
      user.loginVerificationNonce,
    );
    redirect(user.role === 'user' ? PATH_ROOT : PATH_ADMIN);
  } catch (error) {
    if (`${error}`.includes('NEXT_REDIRECT')) { throw error; }
    return errorMessage(error, 'Unable to complete login verification');
  }
};

export const getUsersAction = async () =>
  runAsAdmin(actor => actor.role === 'superadmin'
    ? getAllUsers()
    : getUsersPage(100, 0, ['user']).then(page => page.users));

export const getUsersPageAction = async (limit: number, offset: number) =>
  runAsAdmin(actor => getUsersPage(
    limit,
    offset,
    actor.role === 'superadmin' ? undefined : ['user'],
  ));

const parseUserSearch = (value: string) => {
  const query = value.trim();
  const roleMatch = query.match(
    /^(super[\s-]*admins?|superadmins?|admins?|users?)\s*:?[\s]*/i,
  );
  const roleText = roleMatch?.[1]?.toLowerCase().replace(/[\s-]/g, '');
  const role: UserRole | undefined = roleText?.startsWith('superadmin')
    ? 'superadmin'
    : roleText?.startsWith('admin')
      ? 'admin'
      : roleText?.startsWith('user')
        ? 'user'
        : undefined;
  return {
    role,
    search: roleMatch ? query.slice(roleMatch[0].length) : query,
  };
};

export const searchUsersCommandAction = async (value: string) =>
  runAsAdmin(actor => {
    const { role, search } = parseUserSearch(value);
    const roles: UserRole[] = actor.role === 'superadmin'
      ? role ? [role] : ['superadmin', 'admin', 'user']
      : ['user'];
    return searchUsers(search, roles);
  });

const getCurrentUser = async () => {
  const session = await auth();
  if (!session?.user) { throw new Error('Unauthorized'); }
  if (session.user.id) {
    const user = await findUserById(session.user.id);
    if (user) { return user; }
  }
  if (session.user.email) {
    const row = await findUserByEmail(session.user.email);
    if (row) { return findUserById(row.id); }
  }
  return undefined;
};

export const getCurrentUserAction = async () => getCurrentUser();

const getActiveUserWithCapability = async (
  capability: Parameters<typeof hasCapability>[1],
) => {
  const user = await getCurrentUser();
  if (
    !user ||
    user.status !== 'active' ||
    !hasCapability(user.role, capability)
  ) {
    throw new Error('Unauthorized');
  }
  return user;
};

export const getPersonalFavoriteAction = async (mediaId: string) => {
  if (!mediaId) { throw new Error('Media id is required'); }
  const user = await getActiveUserWithCapability('favorite');
  return isUserFavorite(user.id, mediaId);
};

export const getPersonalFavoriteIdsAction = async () => {
  const session = await auth();
  if (!session?.user?.id) { throw new Error('Unauthorized'); }
  return getActiveUserFavoriteMediaIds(session.user.id);
};

export const setPersonalFavoriteAction = async (
  mediaId: string,
  isFavorite: boolean,
) => {
  if (!mediaId) { throw new Error('Media id is required'); }
  const session = await auth();
  if (!session?.user?.id) { throw new Error('Unauthorized'); }
  return setUserFavorite(session.user.id, mediaId, isFavorite);
};

const runAsAdmin = async <T>(callback: (actor: AppUser) => Promise<T>) => {
  const session = await auth();
  if (!session?.user) { throw new Error('Unauthorized'); }
  if (!hasCapability(session.user.role, 'manage-users')) {
    throw new Error('Insufficient permissions');
  }
  const actor = await getCurrentUser();
  if (!actor || actor.status !== 'active') { throw new Error('Unauthorized'); }
  return callback(actor);
};

export const saveUserAction = async (formData: FormData) => {
  await runAsAdmin(async actor => {
    const id = formValue(formData, 'id');
    const name = formValue(formData, 'name');
    const email = formValue(formData, 'email').toLowerCase();
    const username = formValue(formData, 'username');
    const password = formValue(formData, 'password');
    const role = formValue(formData, 'role') as UserRole;
    const status = formValue(formData, 'status') as UserStatus;
    const mobileInput = formValue(formData, 'mobileNumber');
    const mobileNumber = mobileInput
      ? normalizeSriLankaMobile(mobileInput)
      : '';
    if (!name || !email) { throw new Error('Name and email are required'); }
    if (!isUserRole(role)) { throw new Error('Invalid role'); }
    if (status !== 'active' && status !== 'disabled') {
      throw new Error('Invalid account status');
    }
    if (!isEmail(email)) { throw new Error('Enter a valid email address'); }
    if (username && !isUsername(username)) { throw new Error('Invalid username'); }
    if (password && !isStrongPassword(password)) {
      throw new Error('Password is not strong enough');
    }
    if (id) {
      const existingUser = await findUserById(id);
      if (!existingUser) { throw new Error('User not found'); }
      if (!canManageRole(actor.role, existingUser.role) ||
          !canManageRole(actor.role, role)) {
        throw new Error('Insufficient permissions for this role');
      }
      const mobileChanged = existingUser.mobileNumber !== (mobileNumber || undefined);
      await updateUser(id, {
        ...(name !== existingUser.name && { name }),
        email,
        username,
        role,
        status,
        mobileNumber: mobileNumber || null,
        emailVerified: true,
        ...(mobileChanged && { mobileVerified: false }),
        ...(password && { password }),
      });
    } else {
      if (!canManageRole(actor.role, role)) {
        throw new Error('Insufficient permissions for this role');
      }
      if (!password) { throw new Error('Password is required for new users'); }
      await createUser({
        name,
        email,
        username,
        password,
        role,
        status,
        emailVerified: true,
        mobileNumber: mobileNumber || undefined,
        mobileVerified: false,
        twoFactorEnabled: false,
      });
    }
  });
  revalidatePath(PATH_ADMIN_USERS);
  revalidateTag(AUTH_USERS_CACHE_TAG, 'max');
};

export const deleteUserAction = async (formData: FormData) => {
  await runAsAdmin(async actor => {
    if (!hasCapability(actor.role, 'delete')) {
      throw new Error('Only a super admin can delete users');
    }
    const id = formValue(formData, 'id');
    if (!id) { throw new Error('User id is required'); }
    if (id === actor.id) { throw new Error('You cannot delete your own account'); }
    await deleteUser(id);
  });
  revalidatePath(PATH_ADMIN_USERS);
  revalidateTag(AUTH_USERS_CACHE_TAG, 'max');
};

export const setUserStatusAction = async (formData: FormData) => {
  await runAsAdmin(async actor => {
    const id = formValue(formData, 'id');
    const status = formValue(formData, 'status');
    if (!id) { throw new Error('User id is required'); }
    if (status !== 'active' && status !== 'disabled') {
      throw new Error('Invalid account status');
    }
    if (id === actor.id) { throw new Error('You cannot disable your own account'); }
    const target = await findUserById(id);
    if (!target) { throw new Error('User not found'); }
    if (!canManageRole(actor.role, target.role)) {
      throw new Error('Insufficient permissions for this role');
    }
    await updateUser(id, { status });
  });
  revalidatePath(PATH_ADMIN_USERS);
  revalidateTag(AUTH_USERS_CACHE_TAG, 'max');
};

export const saveProfileAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const user = await getCurrentUser();
    if (!user) { return 'Profile is only available for database users'; }
    const name = formValue(formData, 'name');
    const email = formValue(formData, 'email').toLowerCase();
    const username = formValue(formData, 'username');
    const profileImageUrl = formValue(formData, 'profileImageUrl');
    const password = formValue(formData, 'password');
    if (!name || !email) { return 'Name and email are required'; }
    if (!isEmail(email)) { return 'Enter a valid email address'; }
    if (username && !isUsername(username)) { return 'Invalid username'; }
    if (password && !isStrongPassword(password)) {
      return 'Password is not strong enough';
    }
    await updateUser(user.id, {
      ...(name !== user.name && { name }),
      email,
      username,
      ...(!user.googleLinked && {
        profileImageUrl: profileImageUrl || null,
      }),
      ...(password && { password }),
    });
    revalidatePath(PATH_PROFILE);
    return 'SAVED';
  } catch (error) {
    return errorMessage(error, 'Unable to save profile');
  }
};

export const requestMobileVerificationAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const user = await getCurrentUser();
    if (!user) { return 'Profile is only available for database users'; }
    const mobileNumber = normalizeSriLankaMobile(formValue(formData, 'mobileNumber'));
    const sms = await createSmsVerificationCode(user.id, mobileNumber, 'mobile-setup');
    await sendSmsVerificationCode({
      ...sms,
      userId: user.id,
      purpose: 'mobile-setup',
    });
    return `SENT:${sms.mobileNumber}`;
  } catch (error) {
    return errorMessage(error, 'Unable to send SMS code');
  }
};

export const verifyMobileAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const user = await getCurrentUser();
    if (!user) { return 'Profile is only available for database users'; }
    const mobileNumber = await verifySmsCode(
      user.id,
      formValue(formData, 'mobileNumber'),
      formValue(formData, 'code'),
      'mobile-setup',
    );
    await updateUser(user.id, {
      mobileNumber,
      mobileVerified: true,
    });
    revalidatePath(PATH_PROFILE);
    return 'SAVED';
  } catch (error) {
    return errorMessage(error, 'Unable to verify mobile number');
  }
};

export const removeMobileAction = async () => {
  const user = await getCurrentUser();
  if (!user) { throw new Error('Profile is only available for database users'); }
  await updateUser(user.id, {
    mobileNumber: null,
    mobileVerified: false,
  });
  revalidatePath(PATH_PROFILE);
};

export const startTotpSetupAction = async () => {
  const user = await getCurrentUser();
  if (!user) { throw new Error('Profile is only available for database users'); }
  const secret = generateTotpSecret();
  await updateUser(user.id, {
    totpSecret: secret,
    totpEnabled: false,
  });
  return {
    secret,
    uri: buildTotpUri({
      issuer: getTotpIssuerFromDomain(
        process.env.NEXT_PUBLIC_DOMAIN ||
        process.env.NEXT_PUBLIC_SITE_DOMAIN ||
        BASE_URL,
      ),
      account: user.email,
      secret,
    }),
  };
};

export const confirmTotpSetupAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const user = await getCurrentUser();
    if (!user?.totpSecret) { return 'Generate a setup key first'; }
    const result = verifyTotpCodeWithCounter(
      user.totpSecret,
      formValue(formData, 'code'),
    );
    if (!result.valid || result.counter === null) {
      return 'Authenticator code is invalid';
    }
    await updateUser(user.id, {
      totpEnabled: true,
      twoFactorEnabled: true,
      totpLastUsedCounter: result.counter,
    });
    revalidatePath(PATH_PROFILE);
    return 'SAVED';
  } catch (error) {
    return errorMessage(error, 'Unable to enable authenticator');
  }
};

export const disableTotpAction = async () => {
  const user = await getCurrentUser();
  if (!user) { throw new Error('Profile is only available for database users'); }
  await updateUser(user.id, {
    totpEnabled: false,
    totpSecret: null,
    totpLastUsedCounter: null,
    twoFactorEnabled: Boolean(user.mobileVerified),
  });
  revalidatePath(PATH_PROFILE);
};

export const setTwoFactorAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    const user = await getCurrentUser();
    if (!user) { return 'Profile is only available for database users'; }
    const enabled = formValue(formData, 'enabled') === 'true';
    await updateUser(user.id, { twoFactorEnabled: enabled });
    revalidatePath(PATH_PROFILE);
    return 'SAVED';
  } catch (error) {
    return errorMessage(error, 'Unable to update two-factor authentication');
  }
};
