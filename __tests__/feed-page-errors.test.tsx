import HomePage, {
  generateMetadata as generateHomeMetadata,
} from '../app/page';
import FullPage from '../app/full/page';
import SortedFullPage from '../app/full/[sortType]/[sortOrder]/page';
import GridPage from '../app/grid/page';
import SortedGridPage from '../app/grid/[sortType]/[sortOrder]/page';
import RecentsPage, {
  generateMetadata as generateRecentsMetadata,
} from '../app/recents/page';
import {
  getMediaCached,
  getMediaMetaCached,
  getMediaPageCached,
} from '../src/media/cache';
import { getMedia } from '../src/media/query';
import type { Media } from '../src/media';
import MediaEmptyState from '../src/media/MediaEmptyState';

jest.mock('../src/app/config', () => ({
  GRID_HOMEPAGE_ENABLED: true,
  USER_DEFAULT_SORT_BY: 'takenAt',
}));
jest.mock('../src/app/path', () => ({ PATH_ROOT: '/' }));
jest.mock('../src/media', () => ({
  generateOgImageMetaForMedia: () => ({}),
  INFINITE_SCROLL_GRID_INITIAL: 24,
}));
jest.mock('../src/feed/programmatic', () => ({ FEED_MEDIA_REQUEST_LIMIT: 40 }));
jest.mock('../src/category/cache', () => ({
  getDataForCategoriesCached: async () => ({}),
}));
jest.mock('../src/category/data', () => ({ NULL_CATEGORY_DATA: {} }));
jest.mock('../src/media/cache', () => ({
  getMediaCached: jest.fn(),
  getMediaMetaCached: jest.fn(),
  getMediaPageCached: jest.fn(),
}));
jest.mock('../src/media/query', () => ({ getMedia: jest.fn() }));
jest.mock('../src/media/MediaEmptyState', () => () => null);
jest.mock('../src/media/MediaFullPage', () => () => null);
jest.mock('../src/media/MediaGridPage', () => () => null);
jest.mock('../src/recents/RecentsOverview', () => () => null);
jest.mock('../src/i18n/state/server', () => ({ getAppText: jest.fn() }));
jest.mock('../src/media/sort/preference', () => ({
  getEffectiveMediaSortOptions: async () => ({
    sortBy: 'takenAt',
    sortWithPriority: false,
  }),
}));
jest.mock('../src/media/sort/path', () => ({
  getSortOptionsFromParams: async () => ({
    sortBy: 'takenAt',
    sortWithPriority: false,
  }),
}));

const serverProps = {
  params: Promise.resolve({ sortType: 'taken-at', sortOrder: 'descending' }),
  searchParams: Promise.resolve({}),
};
const variants = [
  ['home', HomePage, getMediaPageCached],
  ['full', FullPage, getMediaPageCached],
  ['sorted full', SortedFullPage, getMediaPageCached],
  ['grid', GridPage, getMediaPageCached],
  ['sorted grid', SortedGridPage, getMediaPageCached],
] as const;

beforeEach(() => {
  jest.mocked(getMedia).mockResolvedValue([]);
  jest.mocked(getMediaCached).mockResolvedValue([]);
  jest.mocked(getMediaPageCached).mockResolvedValue({ photos: [], hasMore: false });
  jest.mocked(getMediaMetaCached).mockResolvedValue({
    count: 0, dateRange: undefined,
  });
});

it.each(variants)('surfaces a %s feed read failure', async (
  _name, page, readMedia,
) => {
  const failure = new Error('Feed unavailable');
  jest.mocked(readMedia).mockRejectedValueOnce(failure);

  await expect(page(serverProps)).rejects.toBe(failure);
});

it.each(variants)('shows the %s empty state for an empty result', async (
  _name, page,
) => {
  expect((await page(serverProps)).type).toBe(MediaEmptyState);
});

it('uses the full-feed lookahead instead of waiting for an exact count', async () => {
  jest.mocked(getMediaMetaCached).mockClear();
  jest.mocked(getMediaPageCached).mockResolvedValueOnce({
    photos: [{ id: 'one' } as Media],
    hasMore: true,
  });

  const result = await FullPage(serverProps);

  expect(getMediaMetaCached).not.toHaveBeenCalled();
  expect(result.props).toMatchObject({
    photosCount: 2,
    initialHasMore: true,
  });
});

it.each([GridPage, SortedGridPage])(
  'uses grid lookahead for pagination instead of counting the feed',
  async page => {
    jest.mocked(getMediaPageCached).mockResolvedValueOnce({
      photos: [{ id: 'one' } as Media],
      hasMore: true,
    });
    jest.mocked(getMediaMetaCached).mockClear();

    const result = await page(serverProps);

    expect(getMediaMetaCached).toHaveBeenCalledTimes(1);
    expect(getMediaMetaCached).toHaveBeenCalledWith();
    expect(result.props).toMatchObject({
      photosCount: 2,
      initialHasMore: true,
    });
  },
);

it('still generates home metadata when the feed is unavailable', async () => {
  const failure = new Error('Feed unavailable');
  jest.mocked(getMediaPageCached).mockRejectedValueOnce(failure);

  await expect(generateHomeMetadata()).resolves.toEqual({});
});

it('surfaces a recents read failure', async () => {
  const failure = new Error('Recents unavailable');
  jest.mocked(getMediaCached).mockRejectedValueOnce(failure);

  await expect(RecentsPage()).rejects.toBe(failure);
});

it('redirects to the gallery when recents is genuinely empty', async () => {
  await expect(RecentsPage()).rejects.toMatchObject({
    digest: 'NEXT_REDIRECT;replace;/;307;',
  });
});

it('still generates recents metadata when the count is unavailable', async () => {
  jest.mocked(getMediaMetaCached).mockRejectedValueOnce(new Error('Unavailable'));

  await expect(generateRecentsMetadata()).resolves.toEqual({});
});
