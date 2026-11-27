import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { revalidatePath, revalidateTag } from 'next/cache';
import AdminUsersClient from '@/admin/AdminUsersClient';
import {
  createUser,
  deleteUser,
  findUserById,
  type AppUser,
} from '@/auth/users';

const mockConfirmDialog = jest.fn();
const mockRefresh = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace }),
}));
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));
jest.mock('../src/app/config', () => ({}));
jest.mock('../src/app/path', () => ({ PATH_ADMIN_USERS: '/admin/users' }));
jest.mock('../src/app/AppState', () => ({
  useAppState: () => ({ confirmDialog: mockConfirmDialog }),
}));
jest.mock('../src/utility/usePrefersReducedMotion', () => () => true);
jest.mock('../src/auth/server', () => ({
  auth: async () => ({
    user: { id: 'admin', role: 'superadmin', status: 'active' },
  }),
}));
jest.mock('../src/auth/site-access', () => ({}));
jest.mock('../src/platforms/postgres', () => ({ query: jest.fn() }));
jest.mock('../src/auth/users', () => ({
  ...jest.requireActual('../src/auth/users'),
  createUser: jest.fn(),
  deleteUser: jest.fn(),
  findUserById: jest.fn(),
}));

const user: AppUser = {
  id: 'user',
  name: 'Existing user',
  email: 'existing@example.com',
  nameManuallySet: true,
  role: 'user',
  status: 'active',
  emailVerified: true,
  googleLinked: false,
  hasPassword: true,
  mobileVerified: false,
  twoFactorEnabled: false,
  totpEnabled: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const editorFor = (editorUser?: AppUser) => <AdminUsersClient
  users={[]}
  totalUsers={0}
  pageNumber={1}
  pageSize={20}
  currentUserId="admin"
  currentUserRole="superadmin"
  editorUser={editorUser}
  creatingUser={!editorUser}
/>;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(findUserById).mockResolvedValue({
    ...user,
    id: 'admin',
    role: 'superadmin',
  });
});

it('keeps draft fields through failed saves until a save succeeds', async () => {
  jest.mocked(createUser).mockRejectedValueOnce(Object.assign(
    new Error('duplicate key details containing user data'),
    { code: '23505', constraint: 'auth_users_email_key' },
  )).mockResolvedValueOnce(user);
  render(editorFor());
  const name = screen.getByLabelText<HTMLInputElement>('Name');
  const email = screen.getByLabelText<HTMLInputElement>('Email');
  const password = screen.getByLabelText<HTMLInputElement>('Password');
  const username = screen.getByLabelText<HTMLInputElement>('Username');
  const mobile = screen.getByLabelText<HTMLInputElement>(/Mobile number/);
  const save = screen.getByRole('button', { name: 'Create user' });

  expect(password.form?.method).toBe('post');
  fireEvent.change(name, { target: { value: 'New user' } });
  fireEvent.change(email, { target: { value: 'new@example.com' } });
  fireEvent.change(username, { target: { value: 'new-user' } });
  fireEvent.change(mobile, { target: { value: '771234567' } });
  fireEvent.change(password, { target: { value: 'weak' } });
  fireEvent.click(save);

  expect((await screen.findByRole('alert')).textContent).toContain(
    'Password must contain at least 8 characters',
  );
  expect(createUser).not.toHaveBeenCalled();
  expect(password.value).toBe('weak');

  fireEvent.change(password, { target: { value: 'Strong1Password' } });
  fireEvent.click(save);
  expect((await screen.findByRole('alert')).textContent).toBe(
    'That email address is already in use.',
  );
  expect(name.value).toBe('New user');
  expect(email.value).toBe('new@example.com');
  expect(username.value).toBe('new-user');
  expect(mobile.value).toBe('771234567');
  expect(password.value).toBe('Strong1Password');
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();

  fireEvent.change(email, { target: { value: 'available@example.com' } });
  fireEvent.click(save);
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  expect(mockReplace).toHaveBeenCalledWith('/admin/users');
  expect(revalidatePath).toHaveBeenCalledWith('/admin/users');
  expect(revalidateTag).toHaveBeenCalledWith('auth-users', 'max');
  expect(createUser).toHaveBeenLastCalledWith(expect.objectContaining({
    email: 'available@example.com',
    mobileNumber: '+94771234567',
  }));
});

it('keeps unsaved edits after a confirmed delete fails', async () => {
  mockConfirmDialog.mockResolvedValue(true);
  jest.mocked(deleteUser)
    .mockRejectedValueOnce(new Error('raw database details'))
    .mockResolvedValueOnce(undefined);
  render(editorFor(user));
  const name = screen.getByLabelText<HTMLInputElement>('Name');
  const remove = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Delete user',
  });

  expect(remove.form?.method).toBe('post');
  fireEvent.change(name, { target: { value: 'Unsaved edit' } });
  fireEvent.click(remove);
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Unable to delete the user. Try again.',
  );
  expect(name.value).toBe('Unsaved edit');
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();

  fireEvent.click(remove);
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  expect(mockConfirmDialog).toHaveBeenCalledTimes(2);
  expect(deleteUser).toHaveBeenNthCalledWith(1, user.id);
  expect(deleteUser).toHaveBeenNthCalledWith(2, user.id);
  expect(mockReplace).toHaveBeenCalledWith('/admin/users');
});

it('leaves a newer editor open when an earlier save succeeds', async () => {
  let finishSave: (() => void) | undefined;
  const saveResult = new Promise<AppUser>(resolve => {
    finishSave = () => resolve(user);
  });
  jest.mocked(createUser).mockReturnValueOnce(saveResult);
  const { rerender } = render(editorFor());

  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'New user' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'new@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'Strong1Password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  await waitFor(() => expect(createUser).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: 'Close user options' }));
  expect(mockReplace).toHaveBeenCalledTimes(1);
  rerender(editorFor(user));
  const name = screen.getByLabelText<HTMLInputElement>('Name');
  fireEvent.change(name, { target: { value: 'Later draft' } });

  await act(async () => {
    finishSave?.();
    await saveResult;
  });
  expect(revalidatePath).toHaveBeenCalledWith('/admin/users');
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(name.value).toBe('Later draft');
});
