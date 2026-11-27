import { testConnectionsAction } from '@/admin/actions';
import { testRedisConnection } from '@/platforms/redis';

jest.mock('next/cache', () => ({
  unstable_cache: (read: () => unknown) => read,
}));
jest.mock('../src/auth/server', () => ({
  runAuthenticatedAdminServerAction: async <T>(check: () => T) => check(),
}));
jest.mock('../src/app/config', () => ({
  APP_CONFIGURATION: {
    hasRedisStorage: true,
    hasLocationServices: true,
  },
  GOOGLE_PLACES_API_KEY: 'test-key',
}));
jest.mock('../src/platforms/redis', () => ({ testRedisConnection: jest.fn() }));
jest.mock('../src/platforms/rate-limit', () => ({
  checkRateLimitAndThrow: jest.fn(),
}));
jest.mock('../src/platforms/postgres', () => ({}));
jest.mock('../src/platforms/storage', () => ({}));
jest.mock('../src/platforms/openai', () => ({}));
jest.mock('../src/media/query', () => ({}));
jest.mock('../src/media/cache', () => ({}));
jest.mock('../src/album/query', () => ({}));
jest.mock('../src/admin/insights', () => ({}));

afterEach(() => jest.restoreAllMocks());

it('reports a Redis rejection without an error object', async () => {
  jest.mocked(testRedisConnection).mockRejectedValueOnce(false);
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}'));

  await expect(testConnectionsAction()).resolves.toMatchObject({
    redisError: 'Connection check failed.',
    locationError: '',
  });
});

it('reports a Google Places HTTP error before reading the response', async () => {
  jest.mocked(testRedisConnection).mockResolvedValueOnce(null);
  const response = new Response('{"error":{"message":"Provider details"}}', {
    status: 403,
  });
  const readBody = jest.spyOn(response, 'json');
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);

  await expect(testConnectionsAction()).resolves.toMatchObject({
    redisError: '',
    locationError: 'Request failed with HTTP 403.',
  });
  expect(readBody).not.toHaveBeenCalled();
});
