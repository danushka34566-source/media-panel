import { auth } from '@/auth/server';
import { findUserById, getUsersPage, type AppUser } from '@/auth/users';
import { canManageRole, hasCapability } from '@/auth/permissions';
import AdminUsersClient from '@/admin/AdminUsersClient';
import { getAdminPageNumber } from '@/admin/pagination';
import { redirect } from 'next/navigation';
import {
  PATH_ACCESS_DENIED,
  PATH_ADMIN_USERS,
  PATH_SIGN_IN,
} from '@/app/path';

const USERS_PAGE_SIZE = 20;
const USER_ID_PATTERN =
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth();
  if (!session?.user) { redirect(PATH_SIGN_IN); }
  if (!hasCapability(session.user.role, 'manage-users')) {
    redirect(PATH_ACCESS_DENIED);
  }
  const params = await searchParams;
  const pageNumber = getAdminPageNumber(params.page, USERS_PAGE_SIZE);
  const offset = (pageNumber - 1) * USERS_PAGE_SIZE;
  const requestedUser = Array.isArray(params.user) ? params.user[0] : params.user;
  const selectedId = requestedUser?.length === 36 &&
    USER_ID_PATTERN.test(requestedUser) ? requestedUser : undefined;
  const [userPage, selectedUser] = await Promise.all([
    getUsersPage(
      USERS_PAGE_SIZE,
      offset,
      session.user.role === 'superadmin' ? undefined : ['user'],
    ),
    selectedId ? findUserById(selectedId) : undefined,
  ]);
  const pageCount = Math.max(1, Math.ceil(userPage.total / USERS_PAGE_SIZE));
  if (pageNumber > pageCount) {
    redirect(pageCount <= 1
      ? PATH_ADMIN_USERS
      : `${PATH_ADMIN_USERS}?page=${pageCount}`);
  }
  if (params.user !== undefined && (!selectedUser || !canManageRole(
    session.user.role,
    selectedUser.role,
  ))) {
    redirect(pageNumber > 1
      ? `${PATH_ADMIN_USERS}?page=${pageNumber}`
      : PATH_ADMIN_USERS);
  }
  // findUserById returns the authentication row, which includes TOTP secrets
  // and verification internals. The editor only needs the public profile data.
  const initialEditorUser = selectedUser && (({
    totpSecret: _totpSecret,
    totpLastUsedCounter: _totpLastUsedCounter,
    loginVerificationNonce: _loginVerificationNonce,
    ...editorUser
  }) => editorUser)(selectedUser);

  return (
    <AdminUsersClient
      users={userPage.users as AppUser[]}
      totalUsers={userPage.total}
      pageNumber={pageNumber}
      pageSize={USERS_PAGE_SIZE}
      currentUserId={session?.user?.id}
      currentUserRole={session?.user?.role}
      editorUser={initialEditorUser}
      creatingUser={params.create === 'true' && !selectedId}
    />
  );
}
