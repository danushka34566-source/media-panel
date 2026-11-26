import { fireEvent, render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import InfiniteMediaScroll from '@/media/InfiniteMediaScroll';
import MediaGridContainer from '@/media/MediaGridContainer';
import useMediaScrollRestoration, {
  rememberMediaScrollPosition,
} from '@/media/useMediaScrollRestoration';
import type { Media } from '@/media';
import { getMediaAction } from '../src/media/actions';

jest.mock('../src/media/actions', () => ({
  getMediaAction: jest.fn(),
  getMediaCachedAction: jest.fn(),
}));
jest.mock('../src/utility/useVisibility', () => ({ __esModule: true, default: () => undefined }));
jest.mock('../src/i18n/state/client', () => ({
  useAppText: () => ({ utility: { tryAgain: 'Try again', loadMore: 'Load more' } }),
}));
jest.mock('../src/components/AppGrid', () => ({
  __esModule: true,
  default: ({ contentMain }: { contentMain: React.ReactNode }) => contentMain,
}));
jest.mock('../src/components/Spinner', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/media/MediaGrid', () => ({
  __esModule: true,
  default: ({ animate }: { animate: boolean }) =>
    <div data-testid="grid" data-animate={animate} />,
}));

const media = (id: string) => ({ id }) as Media;

const feed = (cacheKey = 'restore-deep-grid-card') => <InfiniteMediaScroll
  cacheKey={cacheKey}
  initialOffset={0}
  itemsPerPage={2}
  startImmediately
  useCachedMedia={false}
  restoreCachedPagesOnRemount
>
  {({ photos, onLastMediaVisible }) => <div>
    {photos.map(photo => <span key={photo.id} data-media-id={photo.id}>
      {photo.id}
    </span>)}
    <button onClick={onLastMediaVisible}>Next page</button>
  </div>}
</InfiniteMediaScroll>;

const RestoredFeed = () => {
  useMediaScrollRestoration();
  return feed('restore-with-anchor');
};

describe('infinite media scroll restoration', () => {
  it('settles the restored grid while keeping entrance motion on a fresh entry', () => {
    const grid = <MediaGridContainer cacheKey="grid-entrance" photos={[media('a')]} count={1} />;
    const fresh = render(grid);
    expect(screen.getByTestId('grid').dataset.animate).toBe('true');
    fresh.unmount();

    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const key = `media-panel:scroll:${window.location.pathname}${window.location.search}`;
    window.sessionStorage.setItem(key, JSON.stringify({ top: 300 }));
    try {
      const restored = render(grid);
      expect(screen.getByTestId('grid').dataset.animate).toBe('false');
      restored.rerender(
        <MediaGridContainer cacheKey="grid-entrance" photos={[media('a'), media('b')]} count={2} />,
      );
      expect(screen.getByTestId('grid').dataset.animate).toBe('false');
      restored.unmount();
    } finally {
      window.sessionStorage.removeItem(key);
      scrollTo.mockRestore();
    }
  });

  it('keeps distinct visits to the same search results independent', () => {
    const originalUrl = window.location.href;
    const navigation = Object.getOwnPropertyDescriptor(window, 'navigation');
    const currentEntry = { key: 'first' };
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: { currentEntry },
    });
    try {
      window.history.replaceState(null, '', '/search?query=test');
      rememberMediaScrollPosition('first-card');
      currentEntry.key = 'second';
      rememberMediaScrollPosition('second-card');
      for (const [entry, card] of [
        ['first', 'first-card'], ['second', 'second-card'],
      ]) {
        const snapshot = window.sessionStorage.getItem(
          `media-panel:scroll:/search?query=test#${entry}`,
        );
        expect(JSON.parse(snapshot!)).toMatchObject({ anchorId: card });
      }
    } finally {
      if (navigation) { Object.defineProperty(window, 'navigation', navigation); }
      else { Reflect.deleteProperty(window, 'navigation'); }
      window.history.replaceState(null, '', originalUrl);
      window.sessionStorage.clear();
    }
  });

  it('retains collection filters and page offsets in a restored feed', async () => {
    const fetchMedia = jest.mocked(getMediaAction);
    fetchMedia.mockResolvedValue([media('album-card')]);
    const album = { id: 'a', slug: 'summer__trips', title: 'Summer trips' };
    render(<SWRConfig value={{ provider: () => new Map() }}>
      <InfiniteMediaScroll
        cacheKey="album-summer__trips"
        album={album}
        initialOffset={4}
        itemsPerPage={2}
        startImmediately
        useCachedMedia={false}
        restoreCachedPagesOnRemount
      >
        {({ photos }) => photos.map(photo => <span key={photo.id}>{photo.id}</span>)}
      </InfiniteMediaScroll>
    </SWRConfig>);
    await screen.findByText('album-card');
    expect(fetchMedia).toHaveBeenCalledWith(
      expect.objectContaining({ album, offset: 4 }), undefined,
    );
  });

  it('renders already viewed deep cards immediately after a feed remount', async () => {
    const fetchMedia = jest.mocked(getMediaAction);
    fetchMedia.mockImplementation(async options => options.offset === 0
      ? [media('first-a'), media('first-b')]
      : [media('deep-card'), media('second-b')]);

    const first = render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed()}
    </SWRConfig>);
    await screen.findByText('first-a');
    fireEvent.click(screen.getByText('Next page'));
    await screen.findByText('deep-card');
    first.unmount();

    // Simulate the router losing its SWR provider while the tab's module
    // state survives. No server response is available during the first paint.
    fetchMedia.mockImplementation(() => new Promise<Media[]>(() => undefined));
    render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed()}
    </SWRConfig>);
    expect(screen.getByText('deep-card')).toBeTruthy();
  });

  it('restores a deep card before waiting for a new page response', async () => {
    const fetchMedia = jest.mocked(getMediaAction);
    fetchMedia.mockImplementation(async options => options.offset === 0
      ? [media('first-a'), media('first-b')]
      : [media('deep-card'), media('second-b')]);
    const first = render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed('restore-with-anchor')}
    </SWRConfig>);
    await screen.findByText('first-a');
    fireEvent.click(screen.getByText('Next page'));
    await screen.findByText('deep-card');
    first.unmount();

    const scrollTo = jest.fn();
    const priorScrollTo = window.scrollTo;
    const priorScrollY = window.scrollY;
    const priorOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype, 'offsetTop',
    );
    window.scrollTo = scrollTo;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get() { return this.textContent === 'deep-card' ? 1400 : 0; },
    });
    window.sessionStorage.setItem(
      `media-panel:scroll:${window.location.pathname}${window.location.search}`,
      JSON.stringify({ top: 1350, anchorId: 'deep-card', anchorOffset: 50 }),
    );
    fetchMedia.mockImplementation(() => new Promise<Media[]>(() => undefined));
    try {
      render(<SWRConfig value={{ provider: () => new Map() }}>
        <RestoredFeed />
      </SWRConfig>);
      expect(screen.getByText('deep-card')).toBeTruthy();
      expect(scrollTo).toHaveBeenCalledWith({ top: 1350, behavior: 'auto' });
    } finally {
      window.scrollTo = priorScrollTo;
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: priorScrollY,
      });
      if (priorOffsetTop) {
        Object.defineProperty(HTMLElement.prototype, 'offsetTop', priorOffsetTop);
      }
      window.sessionStorage.clear();
    }
  });
});
