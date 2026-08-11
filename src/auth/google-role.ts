import type { UserRole } from './users';

export const roleForNewGoogleUser = (
  isSetupAuthorized: boolean,
  hasActiveSuperAdmin: boolean,
): UserRole => isSetupAuthorized && !hasActiveSuperAdmin
  ? 'superadmin'
  : 'user';
