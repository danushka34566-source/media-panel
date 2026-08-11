import { auth } from '@/auth/server';
import { findUserById, getUsersPage, type AppUser } from '@/auth/users';
import { canManageRole, hasCapability } from '@/auth/permissions';
import AdminUsersClient from '@/admin/AdminUsersClient';
import { redirect } from 'next/navigation';
import {
  PATH_ACCESS_DENIED,
  PATH_ADMIN_USERS,
  PATH_SIGN_IN,
} from '@/app/path';

const USERS_PAGE_SIZE = 20;

const getPageNumber = (page?: string | string[]) => {
  const value = Array.isArray(page) ? page[0] : page;
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

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
  const pageNumber = getPageNumber(params.page);
  const offset = (pageNumber - 1) * USERS_PAGE_SIZE;
  const userPage = await getUsersPage(
    USERS_PAGE_SIZE,
    offset,
    session.user.role === 'superadmin' ? undefined : ['user'],
  );
  const selectedId = Array.isArray(params.user) ? params.user[0] : params.user;
  const selectedUser = selectedId
    ? await findUserById(selectedId).catch(() => undefined)
    : undefined;
  const initialEditorUser = selectedUser && canManageRole(
    session.user.role,
    selectedUser.role,
  ) ? selectedUser : undefined;
  const pageCount = Math.max(1, Math.ceil(userPage.total / USERS_PAGE_SIZE));
  if (pageNumber > pageCount) {
    redirect(pageCount <= 1
      ? PATH_ADMIN_USERS
      : `${PATH_ADMIN_USERS}?page=${pageCount}`);
  }

  return (
    <AdminUsersClient
      users={userPage.users as AppUser[]}
      totalUsers={userPage.total}
      pageNumber={pageNumber}
      pageSize={USERS_PAGE_SIZE}
      currentUserId={session?.user?.id}
      currentUserRole={session?.user?.role}
      initialEditorUser={initialEditorUser}
    />
  );
}
