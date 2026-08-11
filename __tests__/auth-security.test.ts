import crypto from 'crypto';
import {
  buildTwoFactorResponse,
  KEY_2FA_REQUIRED,
  parseTwoFactorResponse,
} from '@/auth';
import { hashPassword, passwordMatches } from '@/auth/password';
import { canManageRole, hasCapability } from '@/auth/permissions';
import { AUTH_CODE_TTL_MINUTES } from '@/auth';
import { roleForNewGoogleUser } from '@/auth/google-role';
import { getTotpIssuerFromDomain } from '@/auth/totp';

describe('password storage', () => {
  it('creates salted scrypt hashes and verifies them', () => {
    const first = hashPassword('StrongPass1');
    const second = hashPassword('StrongPass1');

    expect(first).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
    expect(first).not.toBe(second);
    expect(passwordMatches('StrongPass1', first)).toBe(true);
    expect(passwordMatches('WrongPass1', first)).toBe(false);
  });

  it('accepts legacy sha256 hashes for automatic migration at login', () => {
    const legacy = crypto
      .createHash('sha256')
      .update('StrongPass1')
      .digest('hex');

    expect(passwordMatches('StrongPass1', legacy)).toBe(true);
    expect(passwordMatches('WrongPass1', legacy)).toBe(false);
  });
});

describe('role permissions', () => {
  it('keeps viewing, downloading, and favorites available to users', () => {
    expect(hasCapability('user', 'view')).toBe(true);
    expect(hasCapability('user', 'download')).toBe(true);
    expect(hasCapability('user', 'favorite')).toBe(true);
    expect(hasCapability('user', 'edit')).toBe(false);
    expect(hasCapability('user', 'upload')).toBe(false);
    expect(hasCapability('user', 'delete')).toBe(false);
  });

  it('allows admins to manage only ordinary users', () => {
    expect(hasCapability('admin', 'edit')).toBe(true);
    expect(hasCapability('admin', 'upload')).toBe(true);
    expect(hasCapability('admin', 'delete')).toBe(false);
    expect(hasCapability('admin', 'manage-configuration')).toBe(false);
    expect(canManageRole('admin', 'user')).toBe(true);
    expect(canManageRole('admin', 'admin')).toBe(false);
    expect(canManageRole('admin', 'superadmin')).toBe(false);
  });

  it('reserves administrator management and deletion for super admins', () => {
    expect(hasCapability('superadmin', 'manage-admins')).toBe(true);
    expect(hasCapability('superadmin', 'delete')).toBe(true);
    expect(hasCapability('superadmin', 'manage-configuration')).toBe(true);
    expect(canManageRole('superadmin', 'user')).toBe(true);
    expect(canManageRole('superadmin', 'admin')).toBe(true);
    expect(canManageRole('superadmin', 'superadmin')).toBe(true);
  });

  it('grants the first Google super admin role only to setup OAuth', () => {
    expect(roleForNewGoogleUser(true, false)).toBe('superadmin');
    expect(roleForNewGoogleUser(false, false)).toBe('user');
    expect(roleForNewGoogleUser(true, true)).toBe('user');
    expect(roleForNewGoogleUser(false, true)).toBe('user');
  });
});

describe('one-time verification codes', () => {
  it('expire after five minutes', () => {
    expect(AUTH_CODE_TTL_MINUTES).toBe(5);
  });
});

describe('two-factor method state', () => {
  it('uses the public hostname as the authenticator issuer', () => {
    expect(getTotpIssuerFromDomain('https://media.example.com/path'))
      .toBe('media.example.com');
    expect(getTotpIssuerFromDomain('gallery.example.com'))
      .toBe('gallery.example.com');
  });

  it('keeps the preferred and available methods in the challenge', () => {
    const response = buildTwoFactorResponse(
      KEY_2FA_REQUIRED,
      'authenticator',
      ['authenticator', 'email', 'sms'],
    );

    expect(parseTwoFactorResponse(response)).toEqual({
      state: KEY_2FA_REQUIRED,
      preferred: 'authenticator',
      available: ['authenticator', 'email', 'sms'],
    });
  });
});
