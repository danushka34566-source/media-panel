import { fireEvent, render, screen } from '@testing-library/react';
import AdminMediaPage from '../app/admin/media/page';
import AdminPhotosPage from '../app/admin/photos/page';
import AdminProcessingPage from '../app/admin/processing/page';
import AdminAppConfigurationServer from '../src/admin/config/AdminAppConfigurationServer';
import {
  getMedia,
  getMediaMeta,
  getPendingMediaProcessingCount,
  getPendingMediaProcessingPage,
} from '../src/media/query';
import {
  getMediaInNeedOfUpdateCountCached,
  getMediaMetaCached,
} from '../src/media/cache';
import type { Media } from '../src/media';
import { getUnregisteredStorageUploadsPage } from '../src/admin/processing/server';
import { getProcessingSettings } from '../src/processing/settings';
import { getSiteAccessSettings } from '../src/auth/site-access';
import { SITE_ACCESS_SETTINGS_DEFAULTS } from '../src/auth/site-access-schema';

const mockRefresh = jest.fn();

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  useRouter: () => ({ refresh: mockRefresh }),
}));
jest.mock('../src/app/config', () => ({
  APP_CONFIGURATION: {},
  getBaseUrl: () => 'http://localhost',
}));
jest.mock('../src/app/AppState', () => ({
  useAppState: () => ({ uploadState: { isUploading: false } }),
}));
jest.mock('../src/components/AppGrid', () => function MockAppGrid({
  contentMain,
}: { contentMain: React.ReactNode }) {
  return <>{contentMain}</>;
});
jest.mock('../src/i18n/state/client', () => ({
  useAppText: () => ({
    photo: { photo: 'Photo', photoPlural: 'Photos' },
    admin: { update: 'Update', updatePlural: 'Updates' },
  }),
}));
jest.mock('../src/admin/AdminMediaTable', () => function MockAdminMediaTable({
  photos,
}: { photos: Media[] }) {
  return <ul>{photos.map(photo => <li key={photo.id}>{photo.id}</li>)}</ul>;
});
jest.mock('../src/components/primitives/PathLoaderButton', () =>
  function MockPathLoaderButton({
    path,
    children,
  }: { path: string, children: React.ReactNode }) {
    return <a href={path}>{children}</a>;
  },
);
jest.mock('../src/media/color/SyncColorButton', () => () => null);
jest.mock('../src/utility/usePrefersReducedMotion', () => () => true);
jest.mock('../src/admin/AdminProcessingTable', () => () => null);
jest.mock('../src/admin/config/AdminAppConfigurationClient', () => () => null);
jest.mock('../src/admin/actions', () => ({
  testConnectionsAction: async () => ({
    databaseError: '',
    driveStorageError: '',
    cloudflareR2StorageError: '',
    redisError: '',
    aiError: '',
    locationError: '',
  }),
}));
jest.mock('../src/media', () => ({}));
jest.mock('../src/media/query', () => ({
  getMedia: jest.fn(),
  getMediaMeta: jest.fn(),
  getPendingMediaProcessingCount: jest.fn(),
  getPendingMediaProcessingPage: jest.fn(),
}));
jest.mock('../src/admin/processing/server', () => ({
  getUnregisteredStorageUploadsPage: jest.fn(),
}));
jest.mock('../src/media/cache', () => ({
  getMediaMetaCached: jest.fn(),
  getMediaInNeedOfUpdateCountCached: jest.fn(),
}));
jest.mock('../src/processing/settings', () => ({
  getProcessingSettings: jest.fn(),
}));
jest.mock('../src/processing/connection-settings', () => ({
  getProcessingConnectionSettingsResolution: async () => ({
    stored: {},
    effective: {},
    usingEnvironmentFallback: false,
  }),
}));
jest.mock('../src/auth/site-access', () => ({ getSiteAccessSettings: jest.fn() }));
jest.mock('../src/app/application-settings', () => ({
  getApplicationSettings: async () => ({}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getMedia).mockResolvedValue([]);
  jest.mocked(getMediaMeta).mockResolvedValue({ count: 0 });
  jest.mocked(getMediaMetaCached).mockResolvedValue({ count: 0 });
  jest.mocked(getMediaInNeedOfUpdateCountCached).mockResolvedValue(0);
});

it('distinguishes an unavailable media list from an empty library', async () => {
  jest.mocked(getMedia)
    .mockRejectedValueOnce(new Error('media unavailable'))
    .mockResolvedValueOnce([]);
  const props = { searchParams: Promise.resolve({}) };

  expect((await AdminPhotosPage(props)).props.photos).toBeUndefined();
  expect((await AdminPhotosPage(props)).props.photos).toEqual([]);
});

it.each([
  ['/admin/media', AdminMediaPage],
  ['/admin/photos', AdminPhotosPage],
] as const)(
  'redirects a stale %s link to the last valid canonical page',
  async (_path, renderPage) => {
    jest.mocked(getMediaMeta).mockResolvedValue({ count: 17 });
    jest.mocked(getMediaMetaCached).mockResolvedValue({ count: 50 });

    const searchParams = Promise.resolve({ page: '4' });
    await expect(renderPage({ searchParams })).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/admin/media?page=2;307;',
    });
    expect(getMediaMetaCached).not.toHaveBeenCalled();

    const photos = [{ id: 'last-page-photo' } as Media];
    jest.mocked(getMedia).mockResolvedValueOnce(photos);
    const result = await AdminMediaPage({
      searchParams: Promise.resolve({ page: '2' }),
    });
    expect(getMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 15 }),
    );
    expect(result.props.photos).toEqual(photos);
  },
);

it('redirects to the base route when only one page remains', async () => {
  const searchParams = Promise.resolve({ page: '2' });
  await expect(AdminMediaPage({ searchParams })).rejects.toMatchObject({
    digest: 'NEXT_REDIRECT;replace;/admin/media;307;',
  });
});

it('keeps the media rows and update link when the total fails', async () => {
  jest.mocked(getMedia).mockResolvedValue([{ id: 'visible-media' } as Media]);
  jest.mocked(getMediaMeta)
    .mockRejectedValueOnce(new Error('total unavailable'));
  jest.mocked(getMediaInNeedOfUpdateCountCached).mockResolvedValueOnce(1);

  const searchParams = Promise.resolve({ page: '2' });
  render(await AdminMediaPage({ searchParams }));

  expect(screen.getByText('visible-media')).toBeTruthy();
  expect(screen.getByRole('alert').textContent)
    .toContain('Media total unavailable.');
  expect(screen.getByRole('link', { name: /update/i }).getAttribute('href'))
    .toBe('/admin/media/updates');
  expect(screen.queryByRole('navigation', { name: 'Pagination' }))
    .toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('keeps pagination and the rows when the update count fails', async () => {
  jest.mocked(getMedia).mockResolvedValue([{ id: 'visible-photo' } as Media]);
  jest.mocked(getMediaMetaCached).mockResolvedValueOnce({ count: 20 });
  jest.mocked(getMediaInNeedOfUpdateCountCached)
    .mockRejectedValueOnce(new Error('update count unavailable'));

  render(await AdminPhotosPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getByText('visible-photo')).toBeTruthy();
  expect(screen.getByRole('alert').textContent)
    .toContain('Update count unavailable.');
  expect(screen.getByRole('navigation', { name: 'Pagination' }))
    .toBeTruthy();
  expect(screen.queryByRole('link', { name: /update/i })).toBeNull();
});

it('keeps one processing queue visible when the other queue read fails', async () => {
  jest.mocked(getUnregisteredStorageUploadsPage)
    .mockRejectedValueOnce(new Error('registration queue unavailable'));
  jest.mocked(getPendingMediaProcessingPage)
    .mockResolvedValueOnce({ total: 0, items: [] });

  const page = await AdminProcessingPage({ searchParams: Promise.resolve({}) });
  const table = page.props.contentMain as React.ReactElement<{
    registrationError: boolean
    processingError: boolean
    registeringTotal: number
    processingTotal: number
  }>;

  expect(table.props.registrationError).toBe(true);
  expect(table.props.processingError).toBe(false);
  expect(table.props.registeringTotal).toBe(0);
  expect(table.props.processingTotal).toBe(0);
});

it('redirects an empty later processing page to the last available page', async () => {
  jest.mocked(getUnregisteredStorageUploadsPage)
    .mockResolvedValueOnce({ total: 30, uploads: [] });
  jest.mocked(getPendingMediaProcessingPage)
    .mockResolvedValueOnce({ total: 0, items: [] });
  jest.mocked(getPendingMediaProcessingCount).mockResolvedValueOnce(17);
  const searchParams = Promise.resolve({
    registrationPage: '2',
    processingPage: '4',
  });

  await expect(AdminProcessingPage({ searchParams })).rejects.toMatchObject({
    digest: 'NEXT_REDIRECT;replace;/admin/processing?registrationPage=2&processingPage=2;307;',
  });
  expect(getPendingMediaProcessingPage).toHaveBeenCalledWith(15, 45);
  expect(getPendingMediaProcessingCount).toHaveBeenCalledTimes(1);
});

it('uses the first queue page for an unsafe processing page number', async () => {
  jest.mocked(getUnregisteredStorageUploadsPage)
    .mockResolvedValueOnce({ total: 0, uploads: [] });
  jest.mocked(getPendingMediaProcessingPage)
    .mockResolvedValueOnce({ total: 0, items: [] });
  await AdminProcessingPage({
    searchParams: Promise.resolve({ processingPage: '90071992547409930' }),
  });
  expect(getPendingMediaProcessingPage).toHaveBeenCalledWith(15, 0);
  expect(getPendingMediaProcessingCount).not.toHaveBeenCalled();
});

it('keeps successful settings reads when a different section fails', async () => {
  jest.mocked(getProcessingSettings).mockRejectedValue(new Error('unavailable'));
  jest.mocked(getSiteAccessSettings).mockResolvedValue(SITE_ACCESS_SETTINGS_DEFAULTS);

  const { props } = await AdminAppConfigurationServer({ secret: 'local-test' });

  expect(props.processingSettings).toBeUndefined();
  expect(props.siteAccessSettings).toEqual(SITE_ACCESS_SETTINGS_DEFAULTS);
});
