import AdminUsersPage from '../app/admin/users/page';
import { findUserById, getUsersPage } from '@/auth/users';

jest.mock('../src/auth/server', () => ({
  auth: async () => ({ user: { id: 'admin', role: 'superadmin' } }),
}));
jest.mock('../src/auth/users', () => ({
  findUserById: jest.fn(),
  getUsersPage: jest.fn(),
}));
jest.mock('../src/app/path', () => ({
  PATH_ADMIN_USERS: '/admin/users',
}));
jest.mock('../src/admin/AdminUsersClient', () => () => null);

const validId = 'c157baf9-e5f6-448a-a816-ec57c975cf74';

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getUsersPage).mockResolvedValue({ users: [], total: 25 });
});

it.each(['', 'not-a-uuid', `${validId}\n`])(
  'clears malformed user selection %p without querying it',
  async user => {
    const searchParams = Promise.resolve({ user, page: '2' });
    await expect(AdminUsersPage({ searchParams })).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/admin/users?page=2;307;',
    });
    expect(findUserById).not.toHaveBeenCalled();
  },
);

it('clears a missing user selection and keeps the list page', async () => {
  jest.mocked(findUserById).mockResolvedValueOnce(undefined);
  const searchParams = Promise.resolve({ user: validId, page: '2' });
  await expect(AdminUsersPage({ searchParams })).rejects.toMatchObject({
    digest: 'NEXT_REDIRECT;replace;/admin/users?page=2;307;',
  });
  expect(findUserById).toHaveBeenCalledWith(validId);

  const { props } = await AdminUsersPage({
    searchParams: Promise.resolve({ page: '2' }),
  });
  expect(props.pageNumber).toBe(2);
  expect(props.totalUsers).toBe(25);
  expect(props.editorUser).toBeUndefined();
});

it('loads the first page for an unsafe page number', async () => {
  const { props } = await AdminUsersPage({
    searchParams: Promise.resolve({ page: '90071992547409930' }),
  });
  expect(props.pageNumber).toBe(1);
  expect(getUsersPage).toHaveBeenCalledWith(20, 0, undefined);
});
