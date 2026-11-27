import {
  findUserById,
  findUserSessionStateById,
  getActiveUserFavoriteMediaIds,
  getUserFavoriteMediaIds,
  isUserFavorite,
} from '@/auth/users';
import { LOCAL_AUDIT_USER_ID } from '@/auth/local-audit-bypass';

const mockQuery = jest.fn();
jest.mock('../src/platforms/postgres', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withPostgresTransaction: jest.fn(),
}));

const env = process.env as unknown as Record<string, string | undefined>;
const oldNodeEnv = env.NODE_ENV;
const oldBypass = env.MEDIA_PANEL_LOCAL_AUTH_BYPASS;

beforeEach(() => {
  env.NODE_ENV = 'development';
  env.MEDIA_PANEL_LOCAL_AUTH_BYPASS = '1';
  mockQuery.mockClear();
});

afterEach(() => {
  if (oldNodeEnv === undefined) { delete env.NODE_ENV; }
  else { env.NODE_ENV = oldNodeEnv; }
  if (oldBypass === undefined) { delete env.MEDIA_PANEL_LOCAL_AUTH_BYPASS; }
  else { env.MEDIA_PANEL_LOCAL_AUTH_BYPASS = oldBypass; }
});

it('resolves the synthetic audit user and favorite state without database calls', async () => {
  await expect(findUserById(LOCAL_AUDIT_USER_ID)).resolves.toMatchObject({
    id: LOCAL_AUDIT_USER_ID,
    role: 'superadmin',
  });
  await expect(findUserSessionStateById(LOCAL_AUDIT_USER_ID)).resolves.toMatchObject({
    id: LOCAL_AUDIT_USER_ID,
    status: 'active',
  });
  await expect(getUserFavoriteMediaIds(LOCAL_AUDIT_USER_ID)).resolves.toEqual([]);
  await expect(getActiveUserFavoriteMediaIds(LOCAL_AUDIT_USER_ID)).resolves.toEqual([]);
  await expect(isUserFavorite(LOCAL_AUDIT_USER_ID, 'media-id')).resolves.toBe(false);
  expect(mockQuery).not.toHaveBeenCalled();
});
