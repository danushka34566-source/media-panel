import { fireEvent, render, screen } from '@testing-library/react';
import { testConnectionsAction } from '@/admin/actions';
import AdminAppConfigurationServer
  from '@/admin/config/AdminAppConfigurationServer';

const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
jest.mock('../src/app/config', () => ({
  APP_CONFIGURATION: {
    hasDatabase: true,
    postgresProvider: 'neon',
    hasDriveStorage: true,
    hasCloudflareR2Storage: false,
    currentStorage: 'drive',
    hasRedisStorage: true,
    isAiTextGenerationEnabled: true,
    hasLocationServices: true,
    hasAuthSecret: true,
    categoryVisibility: [],
    socialKeys: [],
    pageScriptUrls: [],
  },
}));
jest.mock('../src/app/path', () => ({
  PATH_ADMIN_CONFIGURATION: '/admin/configuration',
  PATH_FEED_JSON: '/feed.json',
  PATH_RSS_XML: '/rss.xml',
}));
jest.mock('../src/category', () => ({
  CATEGORY_KEYS: [],
  DEFAULT_CATEGORY_KEYS: [],
}));
jest.mock('../src/media/ai', () => ({
  AI_AUTO_GENERATED_FIELDS_ALL: [],
  AI_AUTO_GENERATED_FIELDS_DEFAULT: [],
}));
jest.mock('../src/admin/actions', () => ({ testConnectionsAction: jest.fn() }));
jest.mock('../src/app/AppState', () => ({ useAppState: () => ({}) }));
jest.mock('../src/utility/useElementHeight', () => () => undefined);
jest.mock('../src/utility/useVisibility', () => () => {});
jest.mock('../src/utility/usePrefersReducedMotion', () => () => true);
jest.mock('../src/processing/settings', () => ({
  getProcessingSettings: async () => ({}),
}));
jest.mock('../src/processing/connection-settings', () => ({
  getProcessingConnectionSettingsResolution: async () => ({
    stored: {},
    effective: {},
    usingEnvironmentFallback: false,
  }),
}));
jest.mock('../src/auth/site-access', () => ({
  getSiteAccessSettings: async () => ({}),
}));
jest.mock('../src/app/application-settings', () => ({
  getApplicationSettings: async () => ({}),
}));
jest.mock('../src/admin/config/ProcessingConfigurationForm', () => () => null);
jest.mock('../src/admin/config/SiteAccessConfigurationForm', () => () => null);
jest.mock('../src/admin/config/StaticOptimizationForm', () => () => null);
jest.mock('../src/app/SecretGenerator', () => () => null);

it('shows unknown connections after probe failure and retries', async () => {
  jest.mocked(testConnectionsAction)
    .mockRejectedValueOnce(new Error('private connection details'))
    .mockResolvedValueOnce({
      databaseError: '',
      driveStorageError: 'Storage connection timed out',
      cloudflareR2StorageError: '',
      redisError: '',
      aiError: '',
      locationError: '',
    });
  const props = { secret: 'local-test' };
  const { rerender } = render(await AdminAppConfigurationServer(props));

  expect(screen.getByRole('alert').textContent).toContain(
    'Unable to check connections. Connection statuses are unknown.',
  );
  expect(screen.getByText('Neon Postgres: connection status unknown'))
    .toBeTruthy();
  expect(screen.getByText('Drive: connection status unknown')).toBeTruthy();
  expect(screen.queryByText(/: connected$/)).toBeNull();
  expect(screen.queryByText('private connection details')).toBeNull();

  const retry = { name: 'Retry connection checks' };
  fireEvent.click(screen.getByRole('button', retry));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  rerender(await AdminAppConfigurationServer(props));

  expect(testConnectionsAction).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Neon Postgres: connected')).toBeTruthy();
  expect(screen.getByText('Drive: connection failed')).toBeTruthy();
  expect(screen.queryByRole('button', retry)).toBeNull();
});
