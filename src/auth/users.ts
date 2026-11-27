import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { query, withPostgresTransaction } from '@/platforms/postgres';
import { hashPassword, passwordMatches } from './password';
import {
  AUTH_CODE_RESEND_COOLDOWN_SECONDS,
  AUTH_CODE_TTL_MINUTES,
} from '.';
import { roleForNewGoogleUser } from './google-role';
import { sendAuthEmail } from './email-delivery';
import {
  createLocalAuditUser,
  isLocalAuthBypassEnabled,
  LOCAL_AUDIT_USER_ID,
} from './local-audit-bypass';
import {
  getVerifiedLoginNonce,
  VerificationCodeCooldownError,
} from './login-verification';
import type { SortBy } from '@/media/sort';

export { hashPassword, passwordMatches } from './password';

export type UserRole = 'superadmin' | 'admin' | 'user';
export type UserStatus = 'active' | 'disabled';
export type VideoPreviewMode = 'off' | 'smart' | 'all';

export type AppUser = {
  id: string
  name: string
  nameManuallySet: boolean
  email: string
  username?: string
  role: UserRole
  status: UserStatus
  emailVerified: boolean
  googleLinked: boolean
  hasPassword: boolean
  googleSub?: string
  profileImageUrl?: string
  mobileNumber?: string
  mobileVerified: boolean
  twoFactorEnabled: boolean
  totpEnabled: boolean
  totpSecret?: string
  totpLastUsedCounter?: number
  loginVerificationNonce?: string
  wideGridEnabled?: boolean
  videoPreviewMode?: VideoPreviewMode
  mediaSortBy?: SortBy
  createdAt: Date
  updatedAt: Date
};

type UserRow = {
  id: string
  name: string
  name_manually_set: boolean
  email: string
  username: string | null
  password_hash: string | null
  has_password?: boolean
  role: UserRole
  status: UserStatus
  email_verified: boolean
  google_linked: boolean
  google_sub: string | null
  profile_image_url: string | null
  mobile_number: string | null
  mobile_verified: boolean
  two_factor_enabled: boolean
  totp_enabled: boolean
  totp_secret: string | null
  totp_last_used_counter: number | null
  login_verification_nonce: string | null
  wide_grid_enabled: boolean | null
  video_preview_mode: VideoPreviewMode | null
  media_sort_by: SortBy | null
  created_at: Date
  updated_at: Date
};

type VerificationPurpose = 'signup' | 'login' | 'password-reset' | 'email-change';
type SmsVerificationPurpose = 'mobile-setup' | 'login' | 'password-reset';
type CodePurpose = VerificationPurpose | SmsVerificationPurpose;

const AUTH_USERS_TABLE = 'auth_users';
export const AUTH_USERS_CACHE_TAG = 'auth-users';
const AUTH_CODES_TABLE = 'auth_verification_codes';
const AUTH_SMS_CODES_TABLE = 'auth_sms_verification_codes';
type VerificationCodeTable = typeof AUTH_CODES_TABLE | typeof AUTH_SMS_CODES_TABLE;
const AUTH_USER_FAVORITES_TABLE = 'auth_user_favorites';
const MAX_VERIFICATION_ATTEMPTS = 5;
const VERIFICATION_REQUEST_TIMESTAMPS = {
  signup: 'signup_verification_requested_at',
  email: 'login_email_verification_requested_at',
  sms: 'login_sms_verification_requested_at',
  mobileSetup: 'mobile_setup_verification_requested_at',
  emailChange: 'email_change_verification_requested_at',
} as const;

const reserveVerificationRequest = async (
  client: PoolClient,
  userId: string,
  channel: keyof typeof VERIFICATION_REQUEST_TIMESTAMPS,
) => {
  const timestamp = VERIFICATION_REQUEST_TIMESTAMPS[channel];
  const { rowCount } = await client.query(`
    UPDATE ${AUTH_USERS_TABLE}
    SET ${timestamp}=now()
    WHERE id=$1 AND status='active' AND ($3::boolean OR NOT email_verified)
      AND (
        ${timestamp} IS NULL OR
        ${timestamp} <= now() - $2::int * interval '1 second'
      )
  `, [userId, AUTH_CODE_RESEND_COOLDOWN_SECONDS, channel !== 'signup']);
  if (!rowCount) {
    throw new VerificationCodeCooldownError();
  }
};

let authTablesReady: Promise<void> | undefined;

export const ensureAuthTables = async () => {
  authTablesReady ??= query(`
    CREATE TABLE IF NOT EXISTS ${AUTH_USERS_TABLE} (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      name_manually_set BOOLEAN NOT NULL DEFAULT TRUE,
      email TEXT NOT NULL UNIQUE,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      google_linked BOOLEAN NOT NULL DEFAULT FALSE,
      google_sub TEXT UNIQUE,
      profile_image_url TEXT,
      mobile_number TEXT,
      mobile_verified BOOLEAN NOT NULL DEFAULT FALSE,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      totp_secret TEXT,
      totp_last_used_counter INTEGER,
      login_verification_nonce TEXT,
      signup_verification_requested_at TIMESTAMPTZ,
      login_email_verification_requested_at TIMESTAMPTZ,
      login_sms_verification_requested_at TIMESTAMPTZ,
      mobile_setup_verification_requested_at TIMESTAMPTZ,
      email_change_verification_requested_at TIMESTAMPTZ,
      wide_grid_enabled BOOLEAN,
      video_preview_mode TEXT NOT NULL DEFAULT 'smart',
      media_sort_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE ${AUTH_USERS_TABLE}
      ADD COLUMN IF NOT EXISTS name_manually_set BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
      ADD COLUMN IF NOT EXISTS mobile_number TEXT,
      ADD COLUMN IF NOT EXISTS mobile_verified BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS totp_secret TEXT,
      ADD COLUMN IF NOT EXISTS totp_last_used_counter INTEGER,
      ADD COLUMN IF NOT EXISTS login_verification_nonce TEXT,
      ADD COLUMN IF NOT EXISTS signup_verification_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS login_email_verification_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS login_sms_verification_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS mobile_setup_verification_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS email_change_verification_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS wide_grid_enabled BOOLEAN,
      ADD COLUMN IF NOT EXISTS video_preview_mode TEXT NOT NULL DEFAULT 'smart',
      ADD COLUMN IF NOT EXISTS media_sort_by TEXT;

    CREATE OR REPLACE FUNCTION protect_last_active_superadmin()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.role = 'superadmin' AND OLD.status = 'active' AND (
        TG_OP = 'DELETE' OR
        NEW.role <> 'superadmin' OR
        NEW.status <> 'active'
      ) THEN
        -- Serialize removals before the READ COMMITTED recheck. Otherwise
        -- two transactions can each see the other administrator as active.
        PERFORM pg_advisory_xact_lock(
          hashtext('media-panel'), hashtext('auth:last-active-superadmin')
        );
        PERFORM 1
        FROM ${AUTH_USERS_TABLE}
        WHERE id <> OLD.id AND role = 'superadmin' AND status = 'active'
        LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'The last active super admin cannot be removed, demoted, or disabled'
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS protect_last_active_superadmin_trigger
      ON ${AUTH_USERS_TABLE};
    CREATE TRIGGER protect_last_active_superadmin_trigger
      BEFORE DELETE OR UPDATE OF role, status ON ${AUTH_USERS_TABLE}
      FOR EACH ROW EXECUTE FUNCTION protect_last_active_superadmin();

    CREATE TABLE IF NOT EXISTS ${AUTH_CODES_TABLE} (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES ${AUTH_USERS_TABLE}(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      delivery_pending BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ${AUTH_CODES_TABLE}
      ADD COLUMN IF NOT EXISTS delivery_pending BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS ${AUTH_SMS_CODES_TABLE} (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES ${AUTH_USERS_TABLE}(id) ON DELETE CASCADE,
      mobile_number TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      delivery_pending BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ${AUTH_SMS_CODES_TABLE}
      ADD COLUMN IF NOT EXISTS delivery_pending BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS ${AUTH_USER_FAVORITES_TABLE} (
      user_id UUID NOT NULL REFERENCES ${AUTH_USERS_TABLE}(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, media_id)
    );
    CREATE INDEX IF NOT EXISTS auth_user_favorites_user_created_idx
      ON ${AUTH_USER_FAVORITES_TABLE}(user_id, created_at DESC);

    CREATE OR REPLACE FUNCTION set_auth_user_favorite(
      target_user_id UUID,
      target_media_id TEXT,
      target_is_favorite BOOLEAN
    ) RETURNS BOOLEAN AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtextextended(
        target_user_id::text || ':' || target_media_id,
        0
      ));

      PERFORM 1
      FROM ${AUTH_USERS_TABLE}
      WHERE id = target_user_id
        AND status = 'active'
        AND role IN ('superadmin', 'admin', 'user')
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized'
          USING ERRCODE = '42501';
      END IF;

      IF target_is_favorite THEN
        INSERT INTO ${AUTH_USER_FAVORITES_TABLE} (user_id, media_id)
        VALUES (target_user_id, target_media_id)
        ON CONFLICT DO NOTHING;
      ELSE
        DELETE FROM ${AUTH_USER_FAVORITES_TABLE}
        WHERE user_id = target_user_id AND media_id = target_media_id;
      END IF;

      RETURN target_is_favorite;
    END;
    $$ LANGUAGE plpgsql;
  `).then(() => undefined);
  return authTablesReady;
};

const mapUser = (row: UserRow): AppUser => ({
  id: row.id,
  name: row.name,
  nameManuallySet: row.name_manually_set,
  email: row.email,
  username: row.username ?? undefined,
  role: row.role,
  status: row.status,
  emailVerified: row.email_verified,
  googleLinked: row.google_linked,
  hasPassword: row.has_password ?? Boolean(row.password_hash),
  googleSub: row.google_sub ?? undefined,
  profileImageUrl: row.profile_image_url ?? undefined,
  mobileNumber: row.mobile_number ?? undefined,
  mobileVerified: row.mobile_verified,
  twoFactorEnabled: row.two_factor_enabled,
  totpEnabled: row.totp_enabled,
  totpSecret: row.totp_secret ?? undefined,
  totpLastUsedCounter: row.totp_last_used_counter ?? undefined,
  loginVerificationNonce: row.login_verification_nonce ?? undefined,
  wideGridEnabled: row.wide_grid_enabled ?? undefined,
  videoPreviewMode: row.video_preview_mode ?? 'smart',
  mediaSortBy: row.media_sort_by ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const isUsername = (value: string) =>
  /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,29}$/.test(value);

export const isStrongPassword = (value: string) =>
  value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

const hashCode = (
  userId: string,
  email: string,
  purpose: VerificationPurpose,
  code: string,
) => crypto
  .createHash('sha256')
  .update(`${userId}:${normalizeEmail(email)}:${purpose}:${code}`)
  .digest('hex');

const hashSmsCode = (
  userId: string,
  mobileNumber: string,
  purpose: SmsVerificationPurpose,
  code: string,
) => crypto
  .createHash('sha256')
  .update(`${userId}:${mobileNumber}:${purpose}:${code}`)
  .digest('hex');

const generateCode = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const publicFields = `
  id, name, name_manually_set, email, username, role, status,
  email_verified, google_linked,
  google_sub, profile_image_url, mobile_number, mobile_verified,
  two_factor_enabled, totp_enabled, totp_secret, totp_last_used_counter,
  login_verification_nonce, (password_hash IS NOT NULL) AS has_password,
  wide_grid_enabled, video_preview_mode, media_sort_by,
  created_at, updated_at
`;

const userListFields = `
  id, name, name_manually_set, email, username, role, status,
  email_verified, google_linked,
  profile_image_url, mobile_number, mobile_verified, two_factor_enabled,
  totp_enabled, totp_last_used_counter,
  (password_hash IS NOT NULL) AS has_password,
  wide_grid_enabled, video_preview_mode, media_sort_by,
  created_at, updated_at
`;

export const getAllUsers = async () => {
  await ensureAuthTables();
  const { rows } = await query<UserRow>(`
    SELECT ${userListFields}
    FROM ${AUTH_USERS_TABLE}
    ORDER BY created_at ASC
  `);
  return rows.map(mapUser);
};

export const getUsersCount = async (roles?: UserRole[]) => {
  await ensureAuthTables();
  const roleFilter = roles?.length ? ' WHERE role = ANY($1::text[])' : '';
  const { rows } = await query<{ count: string | number }>(`
    SELECT COUNT(*) AS count FROM ${AUTH_USERS_TABLE}${roleFilter}
  `, roles?.length ? [roles] : []);
  return Number(rows[0]?.count ?? 0);
};

export const hasActiveSuperAdmin = async () => {
  await ensureAuthTables();
  const { rows } = await query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM ${AUTH_USERS_TABLE}
      WHERE role='superadmin' AND status='active'
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
};

export const getUserFavoriteMediaIds = async (userId: string) => {
  if (isLocalAuthBypassEnabled() && userId === LOCAL_AUDIT_USER_ID) { return []; }
  await ensureAuthTables();
  const { rows } = await query<{ media_id: string }>(`
    SELECT media_id
    FROM ${AUTH_USER_FAVORITES_TABLE}
    WHERE user_id=$1
    ORDER BY created_at DESC
  `, [userId]);
  return rows.map(({ media_id }) => media_id);
};

export const getActiveUserFavoriteMediaIds = async (userId: string) => {
  if (isLocalAuthBypassEnabled() && userId === LOCAL_AUDIT_USER_ID) { return []; }
  await ensureAuthTables();
  const { rows } = await query<{
    status: UserStatus
    role: UserRole
    media_id: string | null
  }>(`
    SELECT users.status, users.role, favorites.media_id
    FROM ${AUTH_USERS_TABLE} users
    LEFT JOIN ${AUTH_USER_FAVORITES_TABLE} favorites
      ON favorites.user_id = users.id
    WHERE users.id=$1
    ORDER BY favorites.created_at DESC NULLS LAST
  `, [userId]);
  const user = rows[0];
  if (
    !user ||
    user.status !== 'active' ||
    !['superadmin', 'admin', 'user'].includes(user.role)
  ) {
    throw new Error('Unauthorized');
  }
  return rows.flatMap(({ media_id }) => media_id ? [media_id] : []);
};

export const isUserFavorite = async (userId: string, mediaId: string) => {
  if (isLocalAuthBypassEnabled() && userId === LOCAL_AUDIT_USER_ID) { return false; }
  await ensureAuthTables();
  const { rows } = await query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM ${AUTH_USER_FAVORITES_TABLE}
      WHERE user_id=$1 AND media_id=$2
    ) AS exists
  `, [userId, mediaId]);
  return Boolean(rows[0]?.exists);
};

export const setUserFavorite = async (
  userId: string,
  mediaId: string,
  isFavorite: boolean,
) => {
  await ensureAuthTables();
  const { rows } = await query<{ is_favorite: boolean }>(`
    SELECT set_auth_user_favorite($1, $2, $3) AS is_favorite
  `, [userId, mediaId, isFavorite]);
  return Boolean(rows[0]?.is_favorite);
};

export const createInitialSuperAdmin = async ({
  name,
  email,
  username,
  password,
}: {
  name: string
  email: string
  username?: string
  password: string
}) => {
  await ensureAuthTables();
  return withPostgresTransaction(async client => {
    // Serializes competing first-run requests, including requests from
    // different application instances.
    await client.query(`LOCK TABLE ${AUTH_USERS_TABLE} IN EXCLUSIVE MODE`);
    const existing = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM ${AUTH_USERS_TABLE}
        WHERE role='superadmin' AND status='active'
      ) AS exists
    `);
    if (existing.rows[0]?.exists) {
      throw new Error('Setup has already been completed');
    }
    const { rows } = await client.query<UserRow>(`
      INSERT INTO ${AUTH_USERS_TABLE} (
        id, name, email, username, password_hash, role, status,
        email_verified, google_linked, mobile_verified, two_factor_enabled
      ) VALUES ($1, $2, $3, $4, $5, 'superadmin', 'active', TRUE, FALSE, FALSE, FALSE)
      RETURNING ${publicFields}
    `, [
      crypto.randomUUID(),
      name.trim(),
      normalizeEmail(email),
      username?.trim() || null,
      hashPassword(password),
    ]);
    return mapUser(rows[0]);
  });
};

export const getUsersPage = async (
  limit = 20,
  offset = 0,
  roles?: UserRole[],
) => {
  await ensureAuthTables();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const safeOffset = Math.max(Math.trunc(offset), 0);
  const roleFilter = roles?.length ? 'WHERE role = ANY($3::text[])' : '';
  const pageValues = roles?.length
    ? [safeLimit, safeOffset, roles]
    : [safeLimit, safeOffset];
  const [{ rows }, total] = await Promise.all([
    query<UserRow>(`
      SELECT ${userListFields}
      FROM ${AUTH_USERS_TABLE}
      ${roleFilter}
      ORDER BY created_at ASC
      LIMIT $1 OFFSET $2
    `, pageValues),
    getUsersCount(roles),
  ]);
  return { users: rows.map(mapUser), total };
};

export const searchUsers = async (
  search: string,
  roles?: UserRole[],
  limit = 18,
) => {
  await ensureAuthTables();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const filters: string[] = [];
  const values: (string | number | readonly string[])[] = [];
  if (roles?.length) {
    values.push(roles);
    filters.push(`role = ANY($${values.length}::text[])`);
  }
  const normalizedSearch = search.trim();
  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    const searchParam = `$${values.length}`;
    filters.push(`(
      name ILIKE ${searchParam} OR
      email ILIKE ${searchParam} OR
      COALESCE(username, '') ILIKE ${searchParam}
    )`);
  }
  values.push(safeLimit);
  const { rows } = await query<UserRow>(`
    SELECT ${userListFields}
    FROM ${AUTH_USERS_TABLE}
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY
      CASE role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      name ASC,
      email ASC
    LIMIT $${values.length}
  `, values);
  return rows.map(mapUser);
};

export const findUserByEmail = async (email: string) => {
  await ensureAuthTables();
  const { rows } = await query<UserRow>(`
    SELECT * FROM ${AUTH_USERS_TABLE} WHERE email=$1 LIMIT 1
  `, [normalizeEmail(email)]);
  return rows[0];
};

export const findUserById = async (id: string) => {
  if (isLocalAuthBypassEnabled() && id === LOCAL_AUDIT_USER_ID) {
    return createLocalAuditUser();
  }
  await ensureAuthTables();
  const { rows } = await query<UserRow>(`
    SELECT * FROM ${AUTH_USERS_TABLE} WHERE id=$1 LIMIT 1
  `, [id]);
  return rows[0] ? mapUser(rows[0]) : undefined;
};

export type UserSessionState = Pick<
  AppUser,
  | 'id'
  | 'name'
  | 'email'
  | 'role'
  | 'status'
  | 'profileImageUrl'
  | 'loginVerificationNonce'
>;

// This is the hot path for every session-backed request. Auth tables are
// created by setup/sign-in flows, so avoid running schema DDL before this
// indexed lookup on every new application instance.
export const findUserSessionStateById = async (
  id: string,
): Promise<UserSessionState | undefined> => {
  if (isLocalAuthBypassEnabled() && id === LOCAL_AUDIT_USER_ID) {
    const user = createLocalAuditUser();
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      profileImageUrl: user.profileImageUrl,
      loginVerificationNonce: undefined,
    };
  }
  const { rows } = await query<Pick<
    UserRow,
    | 'id'
    | 'name'
    | 'email'
    | 'role'
    | 'status'
    | 'profile_image_url'
    | 'login_verification_nonce'
  >>(`
    SELECT id, name, email, role, status, profile_image_url,
           login_verification_nonce
    FROM ${AUTH_USERS_TABLE}
    WHERE id=$1
    LIMIT 1
  `, [id]);
  const row = rows[0];
  return row ? {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    profileImageUrl: row.profile_image_url ?? undefined,
    loginVerificationNonce: row.login_verification_nonce ?? undefined,
  } : undefined;
};

export const findUserByIdentifier = async (identifier: string) => {
  await ensureAuthTables();
  const value = identifier.trim();
  const { rows } = await query<UserRow>(`
    SELECT * FROM ${AUTH_USERS_TABLE}
    WHERE email=$1 OR username=$2
    LIMIT 1
  `, [normalizeEmail(value), value]);
  return rows[0];
};

export const findUserByGoogleSub = async (googleSub: string) => {
  await ensureAuthTables();
  const { rows } = await query<UserRow>(`
    SELECT * FROM ${AUTH_USERS_TABLE} WHERE google_sub=$1 LIMIT 1
  `, [googleSub]);
  return rows[0] ? mapUser(rows[0]) : undefined;
};

export const createUser = async ({
  name,
  email,
  username,
  password,
  role = 'user',
  status = 'active',
  emailVerified = false,
  googleLinked = false,
  googleSub,
  profileImageUrl,
  mobileNumber,
  mobileVerified = false,
  twoFactorEnabled = false,
}: {
  name: string
  email: string
  username?: string
  password?: string
  role?: UserRole
  status?: UserStatus
  emailVerified?: boolean
  googleLinked?: boolean
  googleSub?: string
  profileImageUrl?: string
  mobileNumber?: string
  mobileVerified?: boolean
  twoFactorEnabled?: boolean
}) => {
  await ensureAuthTables();
  const { rows } = await query<UserRow>(`
    INSERT INTO ${AUTH_USERS_TABLE} (
      id, name, email, username, password_hash, role, status,
      email_verified, google_linked, google_sub, profile_image_url,
      mobile_number, mobile_verified, two_factor_enabled
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    RETURNING ${publicFields}
  `, [
    crypto.randomUUID(),
    name.trim(),
    normalizeEmail(email),
    username?.trim() || null,
    password ? hashPassword(password) : null,
    role,
    status,
    emailVerified,
    googleLinked,
    googleSub ?? null,
    profileImageUrl ?? null,
    mobileNumber?.trim() || null,
    mobileVerified,
    twoFactorEnabled,
  ]);
  return mapUser(rows[0]);
};

export const upsertGoogleUser = async ({
  googleSub,
  email,
  name,
  profileImageUrl,
  allowInitialSuperAdmin = false,
  allowNewUser = true,
  expectedLinkUserId,
}: {
  googleSub: string
  email: string
  name: string
  profileImageUrl?: string
  allowInitialSuperAdmin?: boolean
  allowNewUser?: boolean
  expectedLinkUserId?: string
}) => {
  await ensureAuthTables();
  return withPostgresTransaction(async client => {
    // Serializes first-run password and Google setup across app instances.
    // Exactly one request can claim the initial super-admin role.
    await client.query(`LOCK TABLE ${AUTH_USERS_TABLE} IN EXCLUSIVE MODE`);
    const superAdmin = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM ${AUTH_USERS_TABLE}
        WHERE role='superadmin' AND status='active'
      ) AS exists
    `);
    const hasSuperAdmin = Boolean(superAdmin.rows[0]?.exists);
    const initialGoogleRole = roleForNewGoogleUser(
      allowInitialSuperAdmin,
      hasSuperAdmin,
    );
    const isInitialSuperAdmin = initialGoogleRole === 'superadmin';
    const normalizedEmail = normalizeEmail(email);
    const assertLinkAccount = (row: UserRow | undefined) => {
      if (expectedLinkUserId && (
        row?.id !== expectedLinkUserId || row.email !== normalizedEmail ||
        !row.email_verified || row.status !== 'active'
      )) {
        throw new Error('This Google account does not match your profile email');
      }
    };
    const existingByGoogle = await client.query<UserRow>(`
      SELECT * FROM ${AUTH_USERS_TABLE} WHERE google_sub=$1 LIMIT 1
    `, [googleSub]);
    if (existingByGoogle.rows[0]) {
      assertLinkAccount(existingByGoogle.rows[0]);
      const { rows } = await client.query<UserRow>(`
        UPDATE ${AUTH_USERS_TABLE}
        SET email=$2,
            name=CASE
              WHEN name_manually_set THEN name
              ELSE COALESCE(NULLIF($3, ''), name)
            END,
            email_verified=TRUE,
            google_linked=TRUE,
            profile_image_url=$4,
            role=CASE WHEN $5 THEN 'superadmin' ELSE role END,
            status=CASE WHEN $5 THEN 'active' ELSE status END,
            updated_at=now()
        WHERE id=$1
        RETURNING ${publicFields}
      `, [
        existingByGoogle.rows[0].id,
        normalizedEmail,
        name.trim(),
        profileImageUrl ?? null,
        isInitialSuperAdmin,
      ]);
      return mapUser(rows[0]);
    }

    const existingByEmail = await client.query<UserRow>(`
      SELECT * FROM ${AUTH_USERS_TABLE} WHERE email=$1 LIMIT 1
    `, [normalizedEmail]);
    assertLinkAccount(existingByEmail.rows[0]);
    if (existingByEmail.rows[0]) {
      if (existingByEmail.rows[0].google_sub &&
          existingByEmail.rows[0].google_sub !== googleSub) {
        throw new Error('This email is already linked to a different Google account');
      }
      const { rows } = await client.query<UserRow>(`
        UPDATE ${AUTH_USERS_TABLE}
        SET password_hash=CASE WHEN $5::boolean THEN NULL ELSE password_hash END,
            google_linked=TRUE,
            google_sub=$2,
            email_verified=TRUE,
            profile_image_url=$3,
            role=CASE WHEN $4 THEN 'superadmin' ELSE role END,
            status=CASE WHEN $4 THEN 'active' ELSE status END,
            updated_at=now()
        WHERE id=$1
        RETURNING ${publicFields}
      `, [
        existingByEmail.rows[0].id,
        googleSub,
        profileImageUrl ?? null,
        isInitialSuperAdmin,
        !existingByEmail.rows[0].email_verified,
      ]);
      return mapUser(rows[0]);
    }

    if (!allowNewUser && !isInitialSuperAdmin) {
      throw new Error('New account registrations are disabled');
    }

    const { rows } = await client.query<UserRow>(`
      INSERT INTO ${AUTH_USERS_TABLE} (
        id, name, name_manually_set, email, password_hash, role, status,
        email_verified, google_linked, google_sub, profile_image_url,
        mobile_verified, two_factor_enabled
      ) VALUES (
        $1, $2, FALSE, $3, NULL, $4, 'active', TRUE, TRUE, $5, $6,
        FALSE, FALSE
      )
      RETURNING ${publicFields}
    `, [
      crypto.randomUUID(),
      name.trim() || normalizedEmail.split('@')[0] || 'User',
      normalizedEmail,
      initialGoogleRole,
      googleSub,
      profileImageUrl ?? null,
    ]);
    return mapUser(rows[0]);
  });
};

export const verifyPassword = async (identifier: string, password: string) => {
  const row = await findUserByIdentifier(identifier);
  if (!row || !row.password_hash) { return undefined; }
  if (row.status !== 'active') { return undefined; }
  if (!row.email_verified && !row.google_linked) { return undefined; }
  if (!passwordMatches(password, row.password_hash)) { return undefined; }
  if (!row.password_hash.startsWith('scrypt$')) {
    await query(`
      UPDATE ${AUTH_USERS_TABLE}
      SET password_hash=$2, updated_at=now()
      WHERE id=$1
    `, [row.id, hashPassword(password)]);
  }
  return mapUser(row);
};

export const updateUser = async (
  id: string,
  updates: Partial<{
    name: string
    email: string
    username: string
    password: string
    role: UserRole
    status: UserStatus
    emailVerified: boolean
    googleLinked: boolean
    googleSub: string | null
    mobileNumber: string | null
    mobileVerified: boolean
    profileImageUrl: string | null
    twoFactorEnabled: boolean
    totpEnabled: boolean
    totpSecret: string | null
    totpLastUsedCounter: number | null
    loginVerificationNonce: string | null
    wideGridEnabled: boolean
    videoPreviewMode: VideoPreviewMode
    mediaSortBy: SortBy | null
  }>,
  expectedEmail?: string,
) => {
  await ensureAuthTables();
  const setters: string[] = [];
  const values: (string | boolean | number | null)[] = [];
  const add = (field: string, value: string | boolean | number | null) => {
    values.push(value);
    setters.push(`${field}=$${values.length}`);
  };

  if (updates.name !== undefined) {
    add('name', updates.name.trim());
    add('name_manually_set', true);
  }
  if (updates.email !== undefined) { add('email', normalizeEmail(updates.email)); }
  if (updates.username !== undefined) { add('username', updates.username.trim() || null); }
  if (updates.password !== undefined) { add('password_hash', hashPassword(updates.password)); }
  if (updates.role !== undefined) { add('role', updates.role); }
  if (updates.status !== undefined) { add('status', updates.status); }
  if (updates.emailVerified !== undefined) { add('email_verified', updates.emailVerified); }
  if (updates.googleLinked !== undefined) { add('google_linked', updates.googleLinked); }
  if (updates.googleSub !== undefined) { add('google_sub', updates.googleSub); }
  if (updates.mobileNumber !== undefined) { add('mobile_number', updates.mobileNumber); }
  if (updates.mobileVerified !== undefined) { add('mobile_verified', updates.mobileVerified); }
  if (updates.profileImageUrl !== undefined) {
    add('profile_image_url', updates.profileImageUrl);
  }
  if (updates.twoFactorEnabled !== undefined) {
    add('two_factor_enabled', updates.twoFactorEnabled);
  }
  if (updates.totpEnabled !== undefined) { add('totp_enabled', updates.totpEnabled); }
  if (updates.totpSecret !== undefined) { add('totp_secret', updates.totpSecret); }
  if (updates.totpLastUsedCounter !== undefined) {
    add('totp_last_used_counter', updates.totpLastUsedCounter);
  }
  if (updates.loginVerificationNonce !== undefined) {
    add('login_verification_nonce', updates.loginVerificationNonce);
  }
  if (updates.wideGridEnabled !== undefined) {
    add('wide_grid_enabled', updates.wideGridEnabled);
  }
  if (updates.videoPreviewMode !== undefined) {
    add('video_preview_mode', updates.videoPreviewMode);
  }
  if (updates.mediaSortBy !== undefined) {
    add('media_sort_by', updates.mediaSortBy);
  }
  if (setters.length === 0) { throw new Error('No user changes supplied'); }
  const idParameter = values.push(id);
  const emailCondition = expectedEmail === undefined
    ? ''
    : `AND email=$${values.push(normalizeEmail(expectedEmail))}`;
  const { rows } = await query<UserRow>(`
    UPDATE ${AUTH_USERS_TABLE}
    SET ${setters.join(', ')}, updated_at=now()
    WHERE id=$${idParameter} ${emailCondition}
    RETURNING ${publicFields}
  `, values);
  if (!rows[0]) { throw new Error('User not found'); }
  return mapUser(rows[0]);
};

export const completeProfileEmailChange = async (
  userId: string,
  previousEmail: string,
  nextEmail: string,
) => {
  await ensureAuthTables();
  const { rowCount } = await query(`
    WITH changed AS (
      UPDATE ${AUTH_USERS_TABLE}
      SET email=$3, email_verified=TRUE, updated_at=now()
      WHERE id=$1 AND email=$2 AND status='active' AND NOT google_linked
      RETURNING id
    ), revoked_codes AS (
      DELETE FROM ${AUTH_CODES_TABLE} WHERE user_id IN (SELECT id FROM changed)
    )
    SELECT id FROM changed
  `, [userId, normalizeEmail(previousEmail), normalizeEmail(nextEmail)]);
  if (!rowCount) { throw new Error('Your account email has changed. Try again.'); }
};

export const deleteUser = async (id: string) => {
  await ensureAuthTables();
  await query(`DELETE FROM ${AUTH_USERS_TABLE} WHERE id=$1`, [id]);
};

export const normalizeSriLankaMobile = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('94') && digits.length === 11) { return `+${digits}`; }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+94${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith('7')) { return `+94${digits}`; }
  throw new Error('Enter a valid Sri Lankan mobile number');
};

const createStoredVerificationCode = (
  table: VerificationCodeTable,
  recipientColumn: 'email' | 'mobile_number',
  recipient: string,
  userId: string,
  purpose: CodePurpose,
  hash: (code: string) => string,
  cooldownChannel?: keyof typeof VERIFICATION_REQUEST_TIMESTAMPS,
) => withPostgresTransaction(async client => {
  if (cooldownChannel) {
    await reserveVerificationRequest(client, userId, cooldownChannel);
  }
  const staged = usesStagedDelivery(purpose);
  // A replacement leaves the last delivered code usable while the
  // provider is sending. Clear any expired rows left by interrupted sends.
  await client.query(`
    DELETE FROM ${table}
    WHERE user_id=$1 AND purpose=$2 AND (NOT $3::boolean OR expires_at <= now())
  `, [userId, purpose, staged]);

  while (true) {
    const code = generateCode();
    const { rowCount } = await client.query(`
      INSERT INTO ${table} (
        id, user_id, ${recipientColumn}, purpose, code_hash, expires_at,
        delivery_pending
      )
      SELECT $1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval, $7
      WHERE NOT $7::boolean OR NOT EXISTS (
        SELECT 1 FROM ${table} WHERE user_id=$2 AND purpose=$4 AND code_hash=$5
      )
    `, [
      crypto.randomUUID(), userId, recipient, purpose, hash(code),
      AUTH_CODE_TTL_MINUTES, staged,
    ]);
    // A staged code must be distinguishable from every unexpired predecessor.
    if (rowCount) { return code; }
  }
});

const usesStagedDelivery = (purpose: CodePurpose) =>
  purpose === 'login' || purpose === 'mobile-setup' || purpose === 'email-change';

const confirmVerificationCodeDelivery = async (
  table: VerificationCodeTable,
  userId: string,
  purpose: CodePurpose,
  codeHash: string,
) => {
  const { rowCount } = await query(`
    WITH replacement AS (
      UPDATE ${table} SET delivery_pending=FALSE
      WHERE user_id=$1 AND purpose=$2 AND code_hash=$3
        AND delivery_pending AND expires_at > now()
      RETURNING id, created_at
    ), retired AS (
      DELETE FROM ${table} AS prior USING replacement
      WHERE prior.user_id=$1 AND prior.purpose=$2
        AND (prior.created_at, prior.id) < (replacement.created_at, replacement.id)
    )
    SELECT id FROM replacement
  `, [userId, purpose, codeHash]);
  if (!rowCount) { throw new Error('This verification code is no longer available'); }
};

const discardFailedVerificationCode = (
  table: VerificationCodeTable,
  userId: string,
  purpose: CodePurpose,
  codeHash: string,
) => query(`
  DELETE FROM ${table}
  WHERE user_id=$1 AND purpose=$2 AND code_hash=$3
    AND (NOT $4::boolean OR delivery_pending)
`, [userId, purpose, codeHash, usesStagedDelivery(purpose)]).catch(() => undefined);

export const createSmsVerificationCode = async (
  userId: string,
  mobileNumber: string,
  purpose: SmsVerificationPurpose,
) => {
  await ensureAuthTables();
  const normalizedMobile = normalizeSriLankaMobile(mobileNumber);
  const code = await createStoredVerificationCode(
    AUTH_SMS_CODES_TABLE, 'mobile_number', normalizedMobile, userId, purpose,
    value => hashSmsCode(userId, normalizedMobile, purpose, value),
    purpose === 'login' ? 'sms' : purpose === 'mobile-setup' ? 'mobileSetup' : undefined,
  );
  return { code, mobileNumber: normalizedMobile };
};

export const verifySmsCode = async (
  userId: string,
  mobileNumber: string,
  code: string,
  purpose: SmsVerificationPurpose,
) => {
  await ensureAuthTables();
  const normalizedMobile = normalizeSriLankaMobile(mobileNumber);
  const { rows } = await query<{
    id: string
    code_hash: string
    attempts: number
    expires_at: Date
  }>(`
    SELECT id, code_hash, attempts, expires_at
    FROM ${AUTH_SMS_CODES_TABLE}
    WHERE user_id=$1 AND mobile_number=$2 AND purpose=$3 AND NOT delivery_pending
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId, normalizedMobile, purpose]);
  const row = rows[0];
  if (!row || row.expires_at.getTime() <= Date.now()) {
    if (row) {
      await query(`DELETE FROM ${AUTH_SMS_CODES_TABLE} WHERE id=$1`, [row.id]);
    }
    throw new Error('Verification code is invalid or expired');
  }
  if (row.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    await query(`DELETE FROM ${AUTH_SMS_CODES_TABLE} WHERE id=$1`, [row.id]);
    throw new Error('Too many failed attempts. Request a new code.');
  }
  if (row.code_hash !== hashSmsCode(userId, normalizedMobile, purpose, code)) {
    await query(`
      UPDATE ${AUTH_SMS_CODES_TABLE} SET attempts=attempts + 1
      WHERE id=$1 AND attempts < ${MAX_VERIFICATION_ATTEMPTS} AND expires_at > now()
    `, [row.id]);
    throw new Error('Verification code is invalid');
  }
  const consumed = await query(`
    DELETE FROM ${AUTH_SMS_CODES_TABLE}
    WHERE id=$1 AND attempts < ${MAX_VERIFICATION_ATTEMPTS} AND expires_at > now()
    RETURNING id
  `, [row.id]);
  if (!consumed.rowCount) { throw new Error('Verification code was already used'); }
  return normalizedMobile;
};

export const sendSmsVerificationCode = async ({
  userId,
  mobileNumber,
  code,
  purpose,
}: {
  userId: string
  mobileNumber: string
  code: string
  purpose: SmsVerificationPurpose
}) => {
  const token = process.env.TEXTLK_API_TOKEN || process.env.TEXT_LK_API_TOKEN;
  const senderId = process.env.TEXTLK_SENDER_ID ||
    process.env.TEXT_LK_SENDER_ID ||
    'MediaPanel';
  const codeHash = hashSmsCode(userId, mobileNumber, purpose, code);
  try {
    if (!token) { throw new Error('SMS verification is not configured'); }
    const response = await fetch('https://app.text.lk/api/v3/sms/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        recipient: mobileNumber.replace(/^\+/, ''),
        sender_id: senderId,
        type: 'plain',
        message: `Your Media Panel verification code is ${code}. It expires in ${AUTH_CODE_TTL_MINUTES} minutes.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) { throw new Error('Unable to send SMS code'); }
  } catch (error) {
    await discardFailedVerificationCode(
      AUTH_SMS_CODES_TABLE, userId, purpose, codeHash,
    );
    throw error;
  }
  if (usesStagedDelivery(purpose)) {
    await confirmVerificationCodeDelivery(AUTH_SMS_CODES_TABLE, userId, purpose, codeHash);
  }
};

export const markTotpCounterUsed = async (userId: string, counter: number) => {
  await ensureAuthTables();
  const { rows } = await query<UserRow>(`
    UPDATE ${AUTH_USERS_TABLE}
    SET totp_last_used_counter=$2, updated_at=now()
    WHERE id=$1
    AND (
      totp_last_used_counter IS NULL OR
      totp_last_used_counter < $2
    )
    RETURNING *
  `, [userId, counter]);
  return Boolean(rows[0]);
};

export const createLoginVerificationChallenge = async (userId: string) => {
  await ensureAuthTables();
  const nonce = crypto.randomUUID();
  await query(`
    UPDATE ${AUTH_USERS_TABLE}
    SET login_verification_nonce=$2, updated_at=now()
    WHERE id=$1
  `, [userId, nonce]);
  return nonce;
};

export const clearLoginVerificationChallenge = async (
  userId: string,
  nonce?: string,
) => {
  await ensureAuthTables();
  if (nonce) {
    await query(`
      UPDATE ${AUTH_USERS_TABLE}
      SET login_verification_nonce=NULL, updated_at=now()
      WHERE id=$1 AND login_verification_nonce=$2
    `, [userId, nonce]);
    return;
  }
  await query(`
    UPDATE ${AUTH_USERS_TABLE}
    SET login_verification_nonce=NULL, updated_at=now()
    WHERE id=$1
  `, [userId]);
};

export const completeLoginVerificationChallenge = async (
  userId: string,
  nonce: string,
) => {
  await ensureAuthTables();
  const { rowCount } = await query(`
    UPDATE ${AUTH_USERS_TABLE}
    SET login_verification_nonce=$3, updated_at=now()
    WHERE id=$1 AND login_verification_nonce=$2
  `, [userId, nonce, getVerifiedLoginNonce(nonce)]);
  return Boolean(rowCount);
};

export const createVerificationCode = async (
  userId: string,
  email: string,
  purpose: VerificationPurpose,
) => {
  await ensureAuthTables();
  const normalizedEmail = normalizeEmail(email);
  const cooldownChannel = {
    login: 'email',
    signup: 'signup',
    'email-change': 'emailChange',
    'password-reset': undefined,
  } as const;
  return createStoredVerificationCode(
    AUTH_CODES_TABLE, 'email', normalizedEmail, userId, purpose,
    value => hashCode(userId, normalizedEmail, purpose, value),
    cooldownChannel[purpose],
  );
};

export const verifyCode = async (
  email: string,
  code: string,
  purpose: VerificationPurpose,
  userId?: string,
) => {
  await ensureAuthTables();
  const normalizedEmail = normalizeEmail(email);
  const { rows } = await query<{
    id: string
    user_id: string
    code_hash: string
    attempts: number
    expires_at: Date
  }>(`
    SELECT id, user_id, code_hash, attempts, expires_at
    FROM ${AUTH_CODES_TABLE}
    WHERE email=$1 AND purpose=$2 AND NOT delivery_pending
      AND ($3::uuid IS NULL OR user_id=$3)
    ORDER BY created_at DESC
    LIMIT 1
  `, [normalizedEmail, purpose, userId ?? null]);
  const row = rows[0];
  if (!row || row.expires_at.getTime() <= Date.now()) {
    if (row) {
      await query(`DELETE FROM ${AUTH_CODES_TABLE} WHERE id=$1`, [row.id]);
    }
    throw new Error('Verification code is invalid or expired');
  }
  if (row.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    await query(`DELETE FROM ${AUTH_CODES_TABLE} WHERE id=$1`, [row.id]);
    throw new Error('Too many failed attempts. Request a new code.');
  }
  if (row.code_hash !== hashCode(row.user_id, normalizedEmail, purpose, code.replace(/\D/g, ''))) {
    await query(`
      UPDATE ${AUTH_CODES_TABLE} SET attempts=attempts + 1
      WHERE id=$1 AND attempts < ${MAX_VERIFICATION_ATTEMPTS} AND expires_at > now()
    `, [row.id]);
    throw new Error('Verification code is invalid');
  }
  const consumed = await query(`
    DELETE FROM ${AUTH_CODES_TABLE}
    WHERE id=$1 AND attempts < ${MAX_VERIFICATION_ATTEMPTS} AND expires_at > now()
    RETURNING id
  `, [row.id]);
  if (!consumed.rowCount) { throw new Error('Verification code was already used'); }
  return row.user_id;
};

export const sendVerificationEmail = async ({
  userId,
  email,
  name,
  code,
  purpose,
}: {
  userId: string
  email: string
  name: string
  code: string
  purpose: VerificationPurpose
}) => {
  const subject = purpose === 'password-reset'
    ? 'Your Media Panel password reset code'
    : purpose === 'login'
      ? 'Your Media Panel sign-in code'
      : purpose === 'email-change'
        ? 'Verify your new Media Panel email address'
        : 'Verify your Media Panel account';
  const text = `Hello ${name || 'there'}, your Media Panel verification code is ${code}. It expires in ${AUTH_CODE_TTL_MINUTES} minutes.`;
  const codeHash = hashCode(userId, normalizeEmail(email), purpose, code);

  try {
    await sendAuthEmail({ to: email, subject, text });
  } catch (error) {
    await discardFailedVerificationCode(
      AUTH_CODES_TABLE, userId, purpose, codeHash,
    );
    throw error;
  }
  if (usesStagedDelivery(purpose)) {
    await confirmVerificationCodeDelivery(AUTH_CODES_TABLE, userId, purpose, codeHash);
  }
};
