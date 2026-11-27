'use client';

import {
  Fragment,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx/lite';
import {
  FiCopy,
  FiSettings,
  FiX,
} from 'react-icons/fi';
import type { AppUser } from '@/auth/users';
import {
  deleteUserAction,
  saveUserAction,
  setUserStatusAction,
} from '@/auth/actions';
import AppGrid from '@/components/AppGrid';
import AdminTable from '@/admin/AdminTable';
import Modal from '@/components/Modal';
import UserAvatar from '@/components/UserAvatar';
import LoaderButton from '@/components/primitives/LoaderButton';
import ErrorNote from '@/components/ErrorNote';
import { ADMIN_CREATE_USER_EVENT } from './users/events';
import { toastSuccess, toastWarning } from '@/toast';
import SriLankaMobileInput from '@/components/SriLankaMobileInput';
import AdminPagination from './AdminPagination';
import { PATH_ADMIN_USERS } from '@/app/path';
import { goBackOrReplace } from '@/utility/back-navigation';

const badgeClassName = (value: string) => clsx(
  'shrink-0 rounded-sm px-[5px] py-[3px]',
  'text-xs leading-none uppercase',
  value === 'disabled'
    ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300',
);

function UserStatusToggle({
  user,
  isCurrentUser,
}: {
  user: AppUser
  isCurrentUser: boolean
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isActive = user.status === 'active';
  const nextStatus = isActive ? 'disabled' : 'active';
  const label = isCurrentUser
    ? 'You cannot disable your own account'
    : `${isActive ? 'Disable' : 'Enable'} ${user.name}`;
  return (
    <button
      type="button"
      disabled={isCurrentUser || isPending}
      onClick={() => startTransition(async () => {
        const formData = new FormData();
        formData.set('id', user.id);
        formData.set('status', nextStatus);
        try {
          await setUserStatusAction(formData);
          toastSuccess(`${user.name} ${nextStatus}`);
          router.refresh();
        } catch (error) {
          toastWarning(error instanceof Error
            ? error.message
            : 'Unable to change account status');
        }
      })}
      className={clsx(
        'relative inline-flex h-5 w-9 min-h-0 shrink-0 items-center p-0',
        'rounded-full border-0 shadow-none transition-colors duration-200',
        isActive
          ? 'bg-gray-900 dark:bg-gray-100'
          : 'bg-gray-200 dark:bg-gray-800',
        !isCurrentUser && 'cursor-pointer',
        isPending && 'animate-pulse',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
      role="switch"
      aria-checked={isActive}
      aria-label={label}
      title={label}
    >
      <span className={clsx(
        'block size-3.5 rounded-full bg-white shadow-sm',
        'transition-transform duration-200 dark:bg-black',
        isActive ? 'translate-x-[18px]' : 'translate-x-[3px]',
      )} />
    </button>
  );
}

type UserEditorAction = 'save' | 'delete';

function UserEditor({
  user,
  isCurrentUser,
  currentUserRole,
  onClose,
}: {
  user?: AppUser
  isCurrentUser: boolean
  currentUserRole?: string
  onClose: () => void
}) {
  const router = useRouter();
  const editorInstance = useRef<symbol | undefined>(undefined);
  const inFlight = useRef(false);
  const [pendingAction, setPendingAction] = useState<UserEditorAction>();
  const [failure, setFailure] = useState<{
    action: UserEditorAction
    message: string
  }>();

  useLayoutEffect(() => {
    editorInstance.current = Symbol();
    return () => { editorInstance.current = undefined; };
  }, []);

  const close = useCallback(() => {
    editorInstance.current = undefined;
    onClose();
  }, [onClose]);

  const submit = async (
    event: FormEvent<HTMLFormElement>,
    action: UserEditorAction,
  ) => {
    event.preventDefault();
    const submittedEditor = editorInstance.current;
    if (!submittedEditor || inFlight.current) { return; }

    // A fulfilled React form action resets uncontrolled fields, even when the
    // action returns a validation error. Submit manually to retain the draft.
    const formData = new FormData(event.currentTarget);
    const submittedUrl = window.location.pathname + window.location.search;
    inFlight.current = true;
    setPendingAction(action);
    setFailure(undefined);
    let message: string | undefined;
    try {
      const mutation = action === 'save' ? saveUserAction : deleteUserAction;
      message = (await mutation(formData))?.error;
    } catch {
      message = `Unable to ${action} the user. Try again.`;
    } finally {
      inFlight.current = false;
      setPendingAction(undefined);
    }
    if (editorInstance.current !== submittedEditor ||
        submittedUrl !== window.location.pathname + window.location.search) {
      return;
    }
    if (message) {
      setFailure({ action, message });
      return;
    }
    close();
    router.refresh();
  };

  const copyValue = useCallback(async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    toastSuccess(`${label} copied`);
  }, []);

  return (
    <Modal
      onClose={close}
      anchor="center"
      noPadding
      className={clsx(
        'flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] flex-col',
        'overflow-hidden sm:h-auto sm:max-h-[calc(100dvh-2rem)]',
        'sm:w-[min(680px,92vw)]',
        'rounded-xl bg-white dark:bg-black',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-medium p-4 sm:p-5">
          <UserAvatar
            name={user?.name || 'New user'}
            email={user?.email}
            profileImageUrl={user?.profileImageUrl}
            sizeClass="size-11"
            textClassName="text-sm"
            showInitialsFallback
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-main">
              {user?.name || 'Add user'}
            </div>
            <div className="truncate text-sm text-dim">
              {user?.email || 'Create a new panel account'}
            </div>
            {user &&
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className={badgeClassName(user.role)}>{user.role}</span>
                <span className={badgeClassName(user.status)}>{user.status}</span>
                {isCurrentUser &&
                  <span className={badgeClassName('current')}>you</span>}
              </div>}
          </div>
          <button
            type="button"
            onClick={close}
            className={clsx(
              'inline-flex size-8 min-h-0 items-center justify-center',
              'border-none p-0 shadow-none',
              'text-dim hover:text-main',
            )}
            aria-label="Close user options"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <form
            method="post"
            onSubmit={event => void submit(event, 'save')}
            className="space-y-5 p-4 sm:p-5"
          >
          {user && <input type="hidden" name="id" value={user.id} />}

          <section className="space-y-3">
            <div>
              <h2 className="font-medium text-main">Identity</h2>
              <p className="text-xs text-dim">Profile and contact details.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-dim">
                <span>Name</span>
                <input
                  name="name"
                  type="text"
                  defaultValue={user?.name}
                  placeholder="Full name"
                  className="w-full text-main"
                  required
                />
              </label>
              <label className="space-y-1 text-xs text-dim">
                <span>Email</span>
                <input
                  name="email"
                  defaultValue={user?.email}
                  placeholder="name@example.com"
                  type="email"
                  className="w-full text-main"
                  required
                />
              </label>
              <label className="space-y-1 text-xs text-dim">
                <span>Username</span>
                <input
                  name="username"
                  type="text"
                  defaultValue={user?.username}
                  placeholder="Optional username"
                  className="w-full text-main"
                />
              </label>
              <SriLankaMobileInput
                defaultValue={user?.mobileNumber}
                className="text-xs text-dim"
              />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-medium text-main">Access</h2>
              <p className="text-xs text-dim">Role and account availability.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-dim">
                <span>Role</span>
                <select
                  name="role"
                  defaultValue={user?.role ?? 'user'}
                  className="w-full text-main"
                >
                  <option value="user">User</option>
                  {currentUserRole === 'superadmin' && <>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Super admin</option>
                  </>}
                </select>
              </label>
              <label className="space-y-1 text-xs text-dim">
                <span>Status</span>
                <select
                  name="status"
                  defaultValue={user?.status ?? 'active'}
                  className="w-full text-main"
                  disabled={isCurrentUser}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
                {isCurrentUser &&
                  <input type="hidden" name="status" value={user?.status} />}
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-medium text-main">Security</h2>
              <p className="text-xs text-dim">
                Verification, sign-in protection, and password reset.
              </p>
            </div>
            {user &&
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ['Email', user.emailVerified ? 'Verified' : 'Not verified'],
                  [
                    'Mobile',
                    user.mobileNumber
                      ? user.mobileVerified ? 'Verified' : 'Not verified'
                      : 'Not configured',
                  ],
                  ['Two-factor', user.twoFactorEnabled ? 'Enabled' : 'Disabled'],
                  ['Authenticator', user.totpEnabled ? 'Configured' : 'Not configured'],
                  ['Google', user.googleLinked ? 'Linked' : 'Not linked'],
                  ['Password', user.hasPassword ? 'Configured' : 'Not configured'],
                ].map(([label, value]) =>
                  <div
                    key={label}
                    className={clsx(
                      'flex min-w-0 items-center justify-between gap-3',
                      'rounded-md border border-medium px-3 py-2.5',
                    )}
                  >
                    <span className="text-xs text-dim">{label}</span>
                    <span className="truncate text-xs text-main">{value}</span>
                  </div>,
                )}
              </div>}
            <label className="block space-y-1 text-xs text-dim">
              <span>{user ? 'Set a new password' : 'Password'}</span>
              <input
                name="password"
                placeholder={user
                  ? 'Leave blank to keep the current password'
                  : 'At least 8 characters with upper, lower, and number'}
                type="password"
                className="w-full text-main"
                required={!user}
              />
            </label>
          </section>

          {user && currentUserRole === 'superadmin' &&
            <section className="space-y-3">
              <div>
                <h2 className="font-medium text-main">Account information</h2>
                <p className="text-xs text-dim">
                  Created {user.createdAt.toLocaleString()} · Updated{' '}
                  {user.updatedAt.toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="button inline-flex items-center gap-2"
                  onClick={() => void copyValue('User ID', user.id)}
                >
                  <FiCopy size={14} /> Copy user ID
                </button>
                <button
                  type="button"
                  className="button inline-flex items-center gap-2"
                  onClick={() => void copyValue('Email', user.email)}
                >
                  <FiCopy size={14} /> Copy email
                </button>
              </div>
            </section>}

          {failure?.action === 'save' &&
            <ErrorNote>{failure.message}</ErrorNote>}
          <div className="flex items-center justify-end border-t border-medium pt-4">
            <LoaderButton
              type="submit"
              isLoading={pendingAction === 'save'}
              disabled={Boolean(pendingAction)}
              hideFocusOutline
              className="w-full justify-center shadow-none sm:w-auto"
            >
              {user ? 'Save changes' : 'Create user'}
            </LoaderButton>
          </div>
          </form>

          {user && currentUserRole === 'superadmin' &&
            <div className="space-y-3 border-t border-medium p-4 sm:p-5">
            <div>
              <h2 className="font-medium text-red-600 dark:text-red-400">
                Danger zone
              </h2>
              <p className="text-xs text-dim">
                {isCurrentUser
                  ? 'You cannot delete the account currently signed in.'
                  : 'Deleting this user permanently removes their panel access.'}
              </p>
            </div>
            {failure?.action === 'delete' &&
              <ErrorNote>{failure.message}</ErrorNote>}
            <form
              method="post"
              onSubmit={event => void submit(event, 'delete')}
              className="flex justify-end"
            >
              <input type="hidden" name="id" value={user.id} />
              <LoaderButton
                type="submit"
                isLoading={pendingAction === 'delete'}
                disabled={isCurrentUser || Boolean(pendingAction)}
                confirmText={`Delete ${user.email}?`}
                className={clsx(
                  'w-full justify-center border-red-300 text-red-600 sm:w-auto',
                  'dark:border-red-800 dark:text-red-400',
                )}
              >
                Delete user
              </LoaderButton>
            </form>
            </div>}
        </div>
      </div>
    </Modal>
  );
}

export default function AdminUsersClient({
  users,
  totalUsers,
  pageNumber,
  pageSize,
  currentUserId,
  currentUserRole,
  editorUser,
  creatingUser,
}: {
  users: AppUser[]
  totalUsers: number
  pageNumber: number
  pageSize: number
  currentUserId?: string
  currentUserRole?: string
  editorUser?: AppUser
  creatingUser: boolean
}) {
  const router = useRouter();
  const listPath = pageNumber <= 1
    ? PATH_ADMIN_USERS
    : `${PATH_ADMIN_USERS}?page=${pageNumber}`;
  const openEditor = useCallback((userId?: string) => {
    const url = new URL(listPath, window.location.origin);
    if (userId) { url.searchParams.set('user', userId); }
    else { url.searchParams.set('create', 'true'); }
    router.push(url.pathname + url.search, { scroll: false });
  }, [listPath, router]);
  const closeEditor = useCallback(() => {
    goBackOrReplace(router, listPath, 'exact');
  }, [listPath, router]);

  useEffect(() => {
    const openCreateUser = () => openEditor();
    window.addEventListener(ADMIN_CREATE_USER_EVENT, openCreateUser);
    return () => window.removeEventListener(
      ADMIN_CREATE_USER_EVENT,
      openCreateUser,
    );
  }, [openEditor]);

  return (
    <AppGrid
      contentMain={
        <>
          {users.length === 0
            ? <div className="text-sm text-dim">No users.</div>
            : <AdminTable>
              {users.map(user =>
                <Fragment key={user.id}>
                  <UserAvatar
                    name={user.name}
                    email={user.email}
                    profileImageUrl={user.profileImageUrl}
                    sizeClass="size-9"
                    textClassName="text-xs"
                    showInitialsFallback
                  />
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-main">{user.name}</div>
                      <div className="truncate text-xs text-dim">
                        {user.email}
                      </div>
                    </div>
                    <div
                      className="hidden shrink-0 items-center gap-1.5 sm:flex"
                    >
                      <span className={badgeClassName(user.role)}>
                        {user.role}
                      </span>
                      {user.status !== 'active' &&
                      <span className={badgeClassName(user.status)}>
                        {user.status}
                      </span>}
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                    <UserStatusToggle
                      user={user}
                      isCurrentUser={user.id === currentUserId}
                    />
                    <button
                      type="button"
                      onClick={() => openEditor(user.id)}
                      className={clsx(
                        'inline-flex size-8 shrink-0 items-center justify-center',
                        'rounded-md border border-medium bg-transparent',
                        'min-h-0 p-0',
                        'text-dim shadow-none transition-colors',
                        'hover:bg-dim hover:text-main active:bg-medium',
                      )}
                      aria-label={`Manage ${user.name}`}
                      title="Manage user"
                    >
                      <FiSettings className="block" size={15} />
                    </button>
                  </div>
                </Fragment>,
              )}
            </AdminTable>}
          <AdminPagination
            page={pageNumber}
            pageSize={pageSize}
            total={totalUsers}
            hrefForPage={targetPage => targetPage <= 1
              ? PATH_ADMIN_USERS
              : `${PATH_ADMIN_USERS}?page=${targetPage}`}
          />
          {(editorUser || creatingUser) &&
            <UserEditor
              key={editorUser?.id ?? 'new-user'}
              user={editorUser ?? undefined}
              isCurrentUser={editorUser?.id === currentUserId}
              currentUserRole={currentUserRole}
              onClose={closeEditor}
            />}
        </>
      }
    />
  );
}
