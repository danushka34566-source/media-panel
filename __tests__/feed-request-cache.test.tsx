import FullPage, {
  generateMetadata as generateFullMetadata,
} from '../app/full/[sortType]/[sortOrder]/page';
import GridPage, {
  generateMetadata as generateGridMetadata,
} from '../app/grid/[sortType]/[sortOrder]/page';
import { getMediaPageCached } from '../src/media/cache';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  // The client React export does not memoize. Model the server's argument
  // identity matching while calling both route functions in one test request.
  cache: (read: (...args: unknown[]) => unknown) => {
    const calls: { args: unknown[]; result: unknown }[] = [];
    return (...args: unknown[]) => {
      const existing = calls.find(call =>
        call.args.length === args.length &&
        call.args.every((arg, index) => Object.is(arg, args[index])));
      if (existing) return existing.result;
      const result = read(...args);
      calls.push({ args, result });
      return result;
    };
  },
}));

jest.mock('../src/media', () => ({
  generateOgImageMetaForMedia: () => ({}),
  INFINITE_SCROLL_GRID_INITIAL: 24,
}));
jest.mock('../src/feed/programmatic', () => ({ FEED_MEDIA_REQUEST_LIMIT: 40 }));
jest.mock('../src/media/cache', () => ({
  getMediaPageCached: jest.fn(),
  getMediaMetaCached: async () => ({ count: 0 }),
}));
jest.mock('../src/category/cache', () => ({
  getDataForCategoriesCached: async () => ({}),
}));
jest.mock('../src/media/MediaFullPage', () => () => null);
jest.mock('../src/media/MediaGridPage', () => () => null);
jest.mock('../src/media/MediaEmptyState', () => () => null);
jest.mock('../src/app/config', () => ({
  USER_DEFAULT_SORT_OPTIONS: { sortBy: 'takenAt', sortWithPriority: false },
}));
jest.mock('../src/media/sort/path', () => ({
  getSortOptionsFromParams: async () => ({
    sortBy: 'createdAtAsc',
    sortWithPriority: true,
  }),
}));

it.each([
  ['full', FullPage, generateFullMetadata],
  ['grid', GridPage, generateGridMetadata],
] as const)('reuses the media query for %s metadata and its page', async (
  _view,
  page,
  generateMetadata,
) => {
  const readMediaPage = jest.mocked(getMediaPageCached);
  readMediaPage.mockClear();
  readMediaPage.mockResolvedValue({ photos: [], hasMore: false });
  const params = { sortType: 'uploaded-at', sortOrder: 'ascending' };

  await Promise.all([
    page({ params: Promise.resolve(params) }),
    generateMetadata({ params: Promise.resolve({ ...params }) }),
  ]);

  expect(readMediaPage).toHaveBeenCalledTimes(1);
  expect(readMediaPage).toHaveBeenCalledWith(expect.objectContaining({
    excludeFromFeeds: true,
    sortBy: 'createdAtAsc',
    sortWithPriority: true,
  }));
});
