import type { UserRole } from './users';

export type AuthCapability =
  | 'view'
  | 'download'
  | 'favorite'
  | 'edit'
  | 'upload'
  | 'manage-users'
  | 'manage-admins'
  | 'manage-configuration'
  | 'delete';

const ROLE_CAPABILITIES: Record<UserRole, ReadonlySet<AuthCapability>> = {
  user: new Set(['view', 'download', 'favorite']),
  admin: new Set([
    'view',
    'download',
    'favorite',
    'edit',
    'upload',
    'manage-users',
  ]),
  superadmin: new Set([
    'view',
    'download',
    'favorite',
    'edit',
    'upload',
    'manage-users',
    'manage-admins',
    'manage-configuration',
    'delete',
  ]),
};

export const isUserRole = (value: unknown): value is UserRole =>
  value === 'user' || value === 'admin' || value === 'superadmin';

export const hasCapability = (
  role: unknown,
  capability: AuthCapability,
) => isUserRole(role) && ROLE_CAPABILITIES[role].has(capability);

export const canManageRole = (
  actorRole: unknown,
  targetRole: UserRole,
) => actorRole === 'superadmin' || (
  actorRole === 'admin' && targetRole === 'user'
);
