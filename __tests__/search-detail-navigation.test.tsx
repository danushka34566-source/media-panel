import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import MediaPage, { generateMetadata } from '../app/[photoId]/page';
import SearchPage from '../app/search/page';
import { pathForMedia } from '@/app/path';
import type { Media } from '@/media';
import { getMediaNearIdCached } from '@/media/cache';
import { getMedia, getMediaMeta } from '@/media/query';
import type { SortBy } from '@/media/sort';

jest.mock('next/navigation', () => ({
  usePathname: () => '/search',
  useRouter: () => ({}),
}));
jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));
jest.mock('../src/media', () => ({
  INFINITE_SCROLL_GRID_INITIAL: 2,
  INFINITE_SCROLL_GRID_MULTIPLE: 2,
  RELATED_GRID_MEDIA_TO_SHOW: 3,
  descriptionForMedia: () => 'Media description',
  downloadFileNameForMedia: () => '',
  formattedDateRangeForMedia: () => ({}),
  getDisplayTranscodeStatus: () => undefined,
  getMediaPreviewUrl: () => undefined,
  getNextMedia: (current: Media, photos: Media[]) =>
    photos[photos.indexOf(current) + 1],
  getPreviousMedia: (current: Media, photos: Media[]) =>
    photos[photos.indexOf(current) - 1],
  titleForMedia: (photo: Media) => photo.id,
}));
jest.mock('../src/media/query', () => ({
  getMedia: jest.fn(),
  getMediaMeta: jest.fn(),
}));
jest.mock('../src/media/cache', () => ({ getMediaNearIdCached: jest.fn() }));
jest.mock('../src/media/sort/preference', () => ({
  getEffectiveMediaSortOptions: async () => ({
    sortBy: 'createdAtAsc', sortWithPriority: true,
  }),
}));

jest.mock('../src/app/AppState', () => ({ useAppState: () => ({}) }));
jest.mock('../src/auth/usePersonalFavorite', () => () => ({}));
jest.mock('../src/i18n/state/client', () => ({
  useAppText: () => ({
    nav: { prevShort: 'Previous', nextShort: 'Next' },
    photo: { photo: 'Photo' },
  }),
}));
jest.mock('../src/media/actions', () => ({}));
jest.mock('../src/media/useMediaScrollRestoration', () => () => false);
jest.mock('../src/components/useNavigateOrRunActionWithToast', () =>
  () => () => undefined);
jest.mock('../src/components/AppGrid', () =>
  ({ contentMain }: { contentMain: ReactNode }) => contentMain);
jest.mock('../src/components/AnimateItems', () =>
  function AnimateItems({ items }: { items: ReactNode[] }) {
    return <>{items}</>;
  });
jest.mock('../src/components/DivDebugBaselineGrid', () =>
  ({ children }: { children: ReactNode }) => children);
jest.mock('../src/components/Tooltip', () =>
  ({ children }: { children: ReactNode }) => children);
jest.mock('../src/components/LinkWithLoaderBackground', () =>
  function LinkWithLoaderBackground({ children, href }: {
    children: ReactNode
    href: string
  }) {
    return <a href={href}>{children}</a>;
  });
jest.mock('../src/share/ShareButton', () => () => null);
jest.mock('../src/tag/TagHeader', () => () => null);
jest.mock('../src/tag/PrivateHeader', () => () => null);
jest.mock('../src/camera/CameraHeader', () => () => null);
jest.mock('../src/film/FilmHeader', () => () => null);
jest.mock('../src/focal/FocalLengthHeader', () => () => null);
jest.mock('../src/recipe/RecipeHeader', () => () => null);
jest.mock('../src/lens/LensHeader', () => () => null);
jest.mock('../src/year/YearHeader', () => () => null);
jest.mock('../src/recents/RecentsHeader', () => () => null);
jest.mock('../src/album/AlbumHeader', () => () => null);
jest.mock('../src/media/MediaLarge', () =>
  function MediaLarge({ photo, swipePreviousPath, swipeNextPath }: {
    photo: Media
    swipePreviousPath?: string
    swipeNextPath?: string
  }) {
    return <div data-testid="detail-hero" data-photo-id={photo.id}>
      {swipePreviousPath && <a href={swipePreviousPath}>Swipe previous</a>}
      {swipeNextPath && <a href={swipeNextPath}>Swipe next</a>}
    </div>;
  });
jest.mock('../src/media/InfiniteMediaScroll', () =>
  ({ children }: {
    children: (page: { key: string, photos: Media[] }) => ReactNode
  }) => children({ key: 'more', photos: [{ id: 'additional' } as Media] }));
jest.mock('../src/media/MediaGrid', () =>
  function MediaGrid({ photos, sortBy, query }: {
    photos: Media[]
    sortBy?: SortBy
    query?: string
  }) {
    return <>{photos.map(photo => <a
      key={photo.id} href={pathForMedia({ photo, sortBy, query })}
    >
      {photo.id}
    </a>)}</>;
  });

const query = 'R&D #1 + rain';
const sortBy = 'createdAtAsc';
const media = (id: string) => ({ id }) as Media;
const previous = media('previous');
const selected = media('selected');
const next = media('next');
const loadPrimary = jest.mocked<
  (photoId: string) => Promise<Media | undefined>
>(getMedia);

const expectSearchLink = (label: string, id: string) => {
  const href = screen.getByRole('link', { name: label }).getAttribute('href');
  const url = new URL(href ?? '', 'https://media.example');
  expect(url.pathname).toBe(`/${id}`);
  expect(url.searchParams.get('query')).toBe(query);
  expect(url.searchParams.get('sort')).toBe(sortBy);
};

it.each([1, 2])('links to query-aware details for a %s-result feed', async count => {
  jest.mocked(getMedia).mockResolvedValueOnce([selected]);
  jest.mocked(getMediaMeta).mockResolvedValueOnce({ count, dateRange: undefined });

  render(await SearchPage({
    searchParams: Promise.resolve({ query: [` ${query} `, 'ignored'] }),
  }));

  expectSearchLink('selected', selected.id);
  if (count > 1) { expectSearchLink('additional', 'additional'); }
});

it('renders the detail before neighbours and adds navigation without replacing it', async () => {
  const photos = [previous, selected, next];
  const load = jest.mocked(getMediaNearIdCached);
  load.mockClear();
  let resolveNeighbours!: (value: Awaited<ReturnType<typeof load>>) => void;
  load.mockReturnValueOnce(new Promise(resolve => {
    resolveNeighbours = resolve;
  }));
  loadPrimary.mockResolvedValueOnce(selected).mockResolvedValueOnce(selected);

  const props = {
    params: Promise.resolve({ photoId: selected.id }),
    searchParams: Promise.resolve({ sort: sortBy, query: ` ${query} ` }),
  };
  const metadata = await generateMetadata(props);
  expect(load).not.toHaveBeenCalled();
  expect(metadata.openGraph?.url).toMatch(/\/selected$/);

  const detail = await MediaPage(props);
  await act(async () => { render(detail); });
  const hero = screen.getByTestId('detail-hero');
  expect(hero.dataset.photoId).toBe(selected.id);
  expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Swipe next' })).toBeNull();

  await act(async () => {
    resolveNeighbours({
      photo: selected, photos, photosGrid: photos, indexNumber: 2,
    });
  });

  for (const [photoId, options] of load.mock.calls) {
    expect(photoId).toBe(selected.id);
    expect(options).toMatchObject({
      excludeFromFeeds: true,
      sortBy,
      sortWithPriority: true,
      query,
    });
  }
  expect(load).toHaveBeenCalled();
  expect(screen.getByTestId('detail-hero')).toBe(hero);
  expectSearchLink('Previous', previous.id);
  expectSearchLink('Next', next.id);
  expectSearchLink('Swipe previous', previous.id);
  expectSearchLink('Swipe next', next.id);
  expectSearchLink('next', next.id);
});

it('keeps normal detail navigation for a blank search query', async () => {
  const photos = [selected, next];
  const load = jest.mocked(getMediaNearIdCached);
  load.mockResolvedValueOnce({
    photo: selected, photos, photosGrid: photos, indexNumber: 1,
  });
  loadPrimary.mockResolvedValueOnce(selected);

  const detail = await MediaPage({
    params: Promise.resolve({ photoId: selected.id }),
    searchParams: Promise.resolve({ query: '  ' }),
  });
  await act(async () => { render(detail); });
  const nextLink = await screen.findByRole('link', { name: 'Next' });

  expect(load).toHaveBeenLastCalledWith(selected.id, expect.objectContaining({
    sortBy,
    query: undefined,
  }));
  expect(nextLink.getAttribute('href')).toBe(`/next?sort=${sortBy}`);
});
