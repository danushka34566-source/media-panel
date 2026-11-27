import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import InfiniteMediaScroll from '@/media/InfiniteMediaScroll';
import MediaGridContainer from '@/media/MediaGridContainer';
import useMediaScrollRestoration, {
  rememberMediaScrollPosition,
} from '@/media/useMediaScrollRestoration';
import type { Media } from '@/media';
import { getMediaPageAction } from '../src/media/actions';
import type { MediaPage } from '@/media/query';
import {
  currentHistoryKey,
  ensureLegacyHistoryTracking,
} from '../src/utility/back-navigation';

jest.mock('../src/media', () => ({ INFINITE_SCROLL_GRID_MULTIPLE: 36 }));
jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));
jest.mock('../src/media/actions', () => ({
  getMediaPageAction: jest.fn(),
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

const media = (id: string, url = `/${id}`) => ({ id, url }) as Media;
const page = (ids: string[], hasMore = false): MediaPage => ({
  photos: ids.map(id => media(id)),
  hasMore,
});
const scrollStorageKey = () => {
  const key = currentHistoryKey();
  return `media-panel:scroll:${location.pathname}${location.search}${key ? '#' + key : ''}`;
};

const ScrollRestorationProbe = () => {
  useMediaScrollRestoration();
  return null;
};

const KeyedScrollRestorationProbe = () => {
  useMediaScrollRestoration('feed');
  return null;
};

const SearchScrollRestorationProbe = ({ query, anchorTop, anchorId = 'shared' }: {
  query: string
  anchorTop: number
  anchorId?: string
}) => {
  useMediaScrollRestoration(`page-search-${query}`, false, false, query);
  return <a key={anchorId} data-media-id={anchorId} data-layout-top={anchorTop}>
    {query}
  </a>;
};

const feed = (cacheKey = 'restore-deep-grid-card') => <InfiniteMediaScroll
  cacheKey={cacheKey}
  initialOffset={0}
  itemsPerPage={2}
  startImmediately
  useCachedMedia={false}
  restoreCachedPagesOnRemount
>
  {({ key, photos, onLastMediaVisible }) => <div key={key}>
    {photos.map(photo => <span key={photo.id} data-media-id={photo.id}>
      {photo.id}
    </span>)}
    <button onClick={onLastMediaVisible}>Next page</button>
  </div>}
</InfiniteMediaScroll>;

const RevalidationFeed = () => <InfiniteMediaScroll
  cacheKey="retry-stale-revalidation"
  initialOffset={0}
  itemsPerPage={2}
  startImmediately
  useCachedMedia={false}
>
  {({ key, photos, revalidateMedia }) => <div key={key}>
    {photos.map(photo => <span key={photo.id}>{photo.id}</span>)}
    <button onClick={() => { void revalidateMedia?.('stale-card'); }}>
      Refresh loaded page
    </button>
  </div>}
</InfiniteMediaScroll>;

const RestoredFeed = () => {
  useMediaScrollRestoration();
  return feed('restore-with-anchor');
};

describe('infinite media scroll restoration', () => {
  it('loads the first page from the button before the observer signals', async () => {
    jest.mocked(getMediaPageAction).mockResolvedValueOnce(page(['manual-card']));
    render(<SWRConfig value={{ provider: () => new Map() }}>
      <InfiniteMediaScroll
        cacheKey="manual-page"
        initialOffset={0}
        itemsPerPage={2}
        useCachedMedia={false}
      >
        {({ photos }) => photos.map(photo => (
          <span key={photo.id}>{photo.id}</span>
        ))}
      </InfiniteMediaScroll>
    </SWRConfig>);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('manual-card')).toBeTruthy();
  });

  it('retries a failed first page', async () => {
    jest.mocked(getMediaPageAction)
      .mockRejectedValueOnce(new Error('First page failed'))
      .mockResolvedValueOnce(page(['recovered-first-card']));

    render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed('retry-first-page')}
    </SWRConfig>);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('recovered-first-card')).toBeTruthy();
  });

  it('keeps the visible cards when retrying a failed next page', async () => {
    const fetchMedia = jest.mocked(getMediaPageAction);
    let resolveRetry!: (result: MediaPage) => void;
    const retry = new Promise<MediaPage>(resolve => { resolveRetry = resolve; });
    fetchMedia
      .mockClear()
      .mockResolvedValueOnce(page(['loaded-a', 'loaded-b'], true))
      .mockRejectedValueOnce(new Error('Next page failed'))
      .mockReturnValueOnce(retry);

    render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed('retry-next-page')}
    </SWRConfig>);

    await screen.findByText('loaded-a');
    fireEvent.click(screen.getByText('Next page'));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await screen.findByRole('button', { name: 'Load more', busy: true });
    expect(screen.getByText('loaded-a')).toBeTruthy();
    resolveRetry(page(['recovered-next-card']));
    expect(await screen.findByText('recovered-next-card')).toBeTruthy();
    expect(fetchMedia.mock.calls.map(([options]) => options.offset))
      .toEqual([0, 2, 2]);
  });

  it('deduplicates identical storage URLs across separate pages', async () => {
    const fetchMedia = jest.mocked(getMediaPageAction);
    fetchMedia.mockClear()
      .mockResolvedValueOnce({
        photos: [media('first-copy', '/same-storage-url.mp4')],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        photos: [media('later-copy', '/SAME-storage-url.mp4')],
        hasMore: false,
      });

    render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed('duplicate-storage-across-pages')}
    </SWRConfig>);

    expect(await screen.findByText('first-copy')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(fetchMedia).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('later-copy')).toBeNull();
  });

  it('retries a failed refresh of a page that still has cached cards', async () => {
    const fetchMedia = jest.mocked(getMediaPageAction);
    fetchMedia
      .mockClear()
      .mockResolvedValueOnce(page(['stale-card'], true))
      .mockRejectedValueOnce(new Error('Refresh failed'))
      .mockResolvedValueOnce(page(['fresh-card'], true));

    render(<SWRConfig value={{ provider: () => new Map() }}>
      <RevalidationFeed />
    </SWRConfig>);

    expect(await screen.findByText('stale-card')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh loaded page' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('fresh-card')).toBeTruthy();
    expect(fetchMedia.mock.calls.map(([options]) => options.offset))
      .toEqual([0, 0, 0]);
  });

  it('continues past short and empty pages until the source is exhausted', async () => {
    const fetchMedia = jest.mocked(getMediaPageAction);
    fetchMedia
      .mockClear()
      .mockResolvedValueOnce(page(['short-page-card'], true))
      .mockResolvedValueOnce(page([], true))
      .mockResolvedValueOnce(page(['last-a', 'last-b']));

    render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed('short-and-empty-pages')}
    </SWRConfig>);

    const onExhausted = jest.fn();
    window.addEventListener('media-feed-exhausted', onExhausted);
    try {
      await screen.findByText('short-page-card');
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await waitFor(() => expect(screen
        .getAllByRole('button', { name: 'Next page' })).toHaveLength(2));
      expect(onExhausted).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      expect(await screen.findByText('last-b')).toBeTruthy();
      expect(screen.getByText('short-page-card')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      expect(fetchMedia.mock.calls.map(([options]) => options.offset))
        .toEqual([0, 2, 4]);
      expect(onExhausted).toHaveBeenCalledWith(expect.objectContaining({
        detail: {
          cacheKey: 'short-and-empty-pages',
          feedKey: expect.stringContaining('short-and-empty-pages'),
          href: location.href,
        },
      }));
    } finally {
      window.removeEventListener('media-feed-exhausted', onExhausted);
    }
  });

  it('saves and restores query-only visits without the Navigation API', async () => {
    const initialUrl = location.href;
    const firstUrl = '/search?query=first';
    const secondUrl = '/search?query=second';
    const scrollY = jest.replaceProperty(window, 'scrollY', 0);
    const scrollHeight = jest.spyOn(
      document.documentElement, 'scrollHeight', 'get',
    ).mockReturnValue(window.innerHeight + 2000);
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    window.history.replaceState(null, '', firstUrl);
    const probe = render(<ScrollRestorationProbe />);
    try {
      expect(currentHistoryKey()).toBeTruthy();
      const firstKey = scrollStorageKey();
      scrollY.replaceValue(330);
      fireEvent.scroll(window);
      expect(window.sessionStorage.getItem(firstKey)).toBe('{"top":330}');

      await act(async () => { window.history.pushState(null, '', secondUrl); });
      const secondKey = scrollStorageKey();
      expect(secondKey).not.toBe(firstKey);
      scrollY.replaceValue(780);
      fireEvent.scroll(window);
      expect(window.sessionStorage.getItem(secondKey)).toBe('{"top":780}');

      await act(async () => {
        const travelled = new Promise<void>(resolve =>
          window.addEventListener('popstate', () => resolve(), { once: true }));
        window.history.back();
        await travelled;
      });
      expect(location.pathname + location.search).toBe(firstUrl);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 330, behavior: 'auto' });

      scrollY.replaceValue(330);
      await act(async () => {
        const travelled = new Promise<void>(resolve =>
          window.addEventListener('popstate', () => resolve(), { once: true }));
        window.history.forward();
        await travelled;
      });
      expect(location.pathname + location.search).toBe(secondUrl);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 780, behavior: 'auto' });
    } finally {
      probe.unmount();
      window.history.replaceState(null, '', initialUrl);
      window.sessionStorage.clear();
      scrollTo.mockRestore();
      scrollHeight.mockRestore();
      scrollY.restore();
    }
  });

  it('settles the restored grid while keeping entrance motion on a fresh entry', () => {
    const grid = <MediaGridContainer cacheKey="grid-entrance" photos={[media('a')]} count={1} />;
    const fresh = render(grid);
    expect(screen.getByTestId('grid').dataset.animate).toBe('true');
    fresh.unmount();

    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const key = scrollStorageKey();
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

  it('waits for the search results to commit before restoring the entry', async () => {
    const initialUrl = location.href;
    const scrollTop = jest.replaceProperty(window, 'scrollY', 0);
    const scrollHeight = jest.spyOn(document.documentElement, 'scrollHeight', 'get')
      .mockReturnValue(window.innerHeight + 2000);
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const offsetTop = jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function(this: HTMLElement) {
        return Number(this.dataset.layoutTop ?? 0);
      });
    window.history.replaceState(null, '', '/search?query=first');
    const probe = render(<SearchScrollRestorationProbe query="first" anchorTop={1050} />);
    try {
      const firstKey = scrollStorageKey();
      const firstPosition = { top: 1000, anchorId: 'shared', anchorOffset: 50 };
      window.sessionStorage.setItem(firstKey, JSON.stringify(firstPosition));
      window.history.pushState(null, '', '/search?query=second');
      const secondKey = scrollStorageKey();
      const secondPosition = { top: 500, anchorId: 'still-loading', anchorOffset: 50 };
      window.sessionStorage.setItem(secondKey, JSON.stringify(secondPosition));
      probe.rerender(<SearchScrollRestorationProbe query="second" anchorTop={200} />);
      scrollTop.replaceValue(500);
      window.dispatchEvent(new Event('pagehide'));
      scrollTo.mockClear();

      await act(async () => {
        const travelled = new Promise<void>(resolve => {
          window.addEventListener('popstate', () => {
            scrollTop.replaceValue(250);
            fireEvent.pointerDown(window);
            window.dispatchEvent(new Event('pageshow'));
            resolve();
          }, { once: true });
        });
        window.history.back();
        await travelled;
      });
      expect(location.search).toBe('?query=first');
      expect(screen.getByText('second')).toBeTruthy();
      expect(scrollTo).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(firstKey)).toBe(JSON.stringify(firstPosition));
      expect(window.sessionStorage.getItem(secondKey)).toBe(JSON.stringify(secondPosition));
      expect(document.documentElement.dataset.mediaScrollRestoring).toBeUndefined();

      probe.rerender(<SearchScrollRestorationProbe query="first" anchorTop={1050} />);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'auto' });
      expect(window.sessionStorage.getItem(firstKey)).toBe('{"top":1000}');
    } finally {
      probe.unmount();
      window.history.replaceState(null, '', initialUrl);
      window.sessionStorage.clear();
      scrollTop.restore();
      scrollHeight.mockRestore();
      offsetTop.mockRestore();
      scrollTo.mockRestore();
    }
  });

  it('retries restoration when the URL catches up after a search grid commit', async () => {
    const initialUrl = location.href;
    const scrollY = jest.replaceProperty(window, 'scrollY', 0);
    const scrollHeight = jest.spyOn(document.documentElement, 'scrollHeight', 'get')
      .mockReturnValue(window.innerHeight + 2000);
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const offsetTop = jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function(this: HTMLElement) {
        return Number(this.dataset.layoutTop ?? 0);
      });
    window.history.replaceState(null, '', '/search?query=first');
    const probe = render(<SearchScrollRestorationProbe query="second" anchorTop={1050} />);
    try {
      window.history.pushState(null, '', '/search?query=second');
      const key = scrollStorageKey();
      window.sessionStorage.setItem(key, JSON.stringify({
        top: 1000, anchorId: 'shared', anchorOffset: 50,
      }));
      await act(async () => { await Promise.resolve(); });

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'auto' });
      expect(window.sessionStorage.getItem(key)).toBe('{"top":1000}');
    } finally {
      probe.unmount();
      window.history.replaceState(null, '', initialUrl);
      window.sessionStorage.clear();
      scrollY.restore();
      scrollHeight.mockRestore();
      offsetTop.mockRestore();
      scrollTo.mockRestore();
    }
  });

  it('resumes a pending anchor after Back and Forward before a grid commit', async () => {
    const initialUrl = location.href;
    const scrollY = jest.replaceProperty(window, 'scrollY', 0);
    const scrollHeight = jest.spyOn(document.documentElement, 'scrollHeight', 'get')
      .mockReturnValue(window.innerHeight + 2000);
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const offsetTop = jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function(this: HTMLElement) {
        return Number(this.dataset.layoutTop ?? 0);
      });
    const traverse = (delta: number) => act(async () => {
      const changed = new Promise<void>(resolve =>
        window.addEventListener('popstate', () => resolve(), { once: true }));
      window.history.go(delta);
      await changed;
    });
    window.history.replaceState(null, '', '/search?query=first');
    const probe = render(<SearchScrollRestorationProbe query="first" anchorTop={0} />);
    try {
      window.history.pushState(null, '', '/search?query=second');
      const secondKey = scrollStorageKey();
      window.sessionStorage.setItem(secondKey, JSON.stringify({
        top: 500, anchorId: 'shared', anchorOffset: 50,
      }));
      probe.rerender(<SearchScrollRestorationProbe
        query="second" anchorTop={0} anchorId="loading"
      />);
      scrollY.replaceValue(500);
      expect(document.documentElement.dataset.mediaScrollRestoring).toBe('true');

      await traverse(-1);
      expect(location.search).toBe('?query=first');
      expect(document.documentElement.dataset.mediaScrollRestoring).toBeUndefined();
      // The second grid is still mounted when the browser returns to it.
      await traverse(1);
      expect(location.search).toBe('?query=second');
      await act(async () => probe.rerender(
        <SearchScrollRestorationProbe query="second" anchorTop={1050} />,
      ));

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'auto' });
      expect(window.sessionStorage.getItem(secondKey)).toBe('{"top":1000}');
    } finally {
      probe.unmount();
      window.history.replaceState(null, '', initialUrl);
      window.sessionStorage.clear();
      scrollY.restore();
      scrollHeight.mockRestore();
      offsetTop.mockRestore();
      scrollTo.mockRestore();
    }
  });

  it('releases restoration when a static feed has no saved card', () => {
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const key = scrollStorageKey();
    window.sessionStorage.setItem(key, JSON.stringify({
      top: 900,
      anchorId: 'removed-card',
      anchorOffset: 24,
    }));
    try {
      const view = render(
        <MediaGridContainer
          cacheKey="static-restore"
          photos={[media('visible-card')]}
          count={1}
        />,
      );
      expect(document.documentElement.dataset.mediaScrollRestoring).toBeUndefined();
      expect(window.sessionStorage.getItem(key)).toBe('{"top":0}');
      view.unmount();
    } finally {
      window.sessionStorage.removeItem(key);
      delete document.documentElement.dataset.mediaScrollRestoring;
      scrollTo.mockRestore();
    }
  });

  it('settles a missing anchor when the matching infinite feed is exhausted', () => {
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const scrollHeight = jest.spyOn(
      document.documentElement, 'scrollHeight', 'get',
    ).mockReturnValue(window.innerHeight + 500);
    const key = scrollStorageKey();
    window.sessionStorage.setItem(key, JSON.stringify({
      top: 1200,
      anchorId: 'deleted-card',
      anchorOffset: 16,
    }));
    const view = render(<KeyedScrollRestorationProbe />);
    try {
      expect(document.documentElement.dataset.mediaScrollRestoring).toBe('true');
      act(() => window.dispatchEvent(new CustomEvent('media-feed-exhausted', {
        detail: { cacheKey: 'other-feed', href: `${location.origin}/` },
      })));
      expect(document.documentElement.dataset.mediaScrollRestoring).toBe('true');

      act(() => window.dispatchEvent(new CustomEvent('media-feed-exhausted', {
        detail: { cacheKey: 'feed', href: location.href },
      })));
      expect(document.documentElement.dataset.mediaScrollRestoring).toBeUndefined();
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 500, behavior: 'auto' });
      expect(window.sessionStorage.getItem(key)).toBe('{"top":500}');
    } finally {
      view.unmount();
      window.sessionStorage.removeItem(key);
      delete document.documentElement.dataset.mediaScrollRestoring;
      scrollTo.mockRestore();
      scrollHeight.mockRestore();
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

  it('captures the full-feed card anchor when only its media ID is supplied', () => {
    const key = scrollStorageKey();
    const { getByText } = render(
      <div data-media-id="large-card">
        <div>Media surface</div>
        <a href="#large-card" data-media-id="large-card">Media title</a>
      </div>,
    );
    Object.defineProperty(getByText('Media title'), 'offsetTop', {
      value: 640,
    });

    try {
      rememberMediaScrollPosition('large-card');
      expect(JSON.parse(window.sessionStorage.getItem(key)!)).toMatchObject({
        anchorId: 'large-card',
        anchorOffset: 640 - window.scrollY,
      });
    } finally {
      window.sessionStorage.removeItem(key);
    }
  });

  it('retains collection filters and page offsets in a restored feed', async () => {
    const fetchMedia = jest.mocked(getMediaPageAction);
    fetchMedia.mockResolvedValue(page(['album-card']));
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
      expect.objectContaining({ album, offset: 4 }), false,
    );
  });

  it('renders already viewed deep cards immediately after a feed remount', async () => {
    const fetchMedia = jest.mocked(getMediaPageAction);
    fetchMedia.mockImplementation(async options => options.offset === 0
      ? page(['first-a', 'first-b'], true)
      : page(['deep-card', 'second-b']));

    const first = render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed()}
    </SWRConfig>);
    await screen.findByText('first-a');
    fireEvent.click(screen.getByText('Next page'));
    await screen.findByText('deep-card');
    first.unmount();

    // Simulate the router losing its SWR provider while the tab's module
    // state survives. No server response is available during the first paint.
    fetchMedia.mockImplementation(() => new Promise<MediaPage>(() => undefined));
    render(<SWRConfig value={{ provider: () => new Map() }}>
      {feed()}
    </SWRConfig>);
    expect(screen.getByText('deep-card')).toBeTruthy();
  });

  it('restores a deep card before waiting for a new page response', async () => {
    const fetchMedia = jest.mocked(getMediaPageAction);
    fetchMedia.mockImplementation(async options => options.offset === 0
      ? page(['first-a', 'first-b'], true)
      : page(['deep-card', 'second-b']));
    const first = render(<SWRConfig value={{ provider: () => new Map() }}>
      <RestoredFeed />
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
      scrollStorageKey(),
      JSON.stringify({ top: 1350, anchorId: 'deep-card', anchorOffset: 50 }),
    );
    fetchMedia.mockImplementation(() => new Promise<MediaPage>(() => undefined));
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

  it('loads an uncached anchor even when the old offset is above the sentinel', async () => {
    const cacheKey = 'restore-above-sentinel';
    const fetchMedia = jest.mocked(getMediaPageAction);
    fetchMedia.mockClear();
    fetchMedia.mockImplementation(async ({ offset }) => {
      if (offset === 0) { return page(['first-card'], true); }
      if (offset === 2) { return page(['next-card'], true); }
      if (offset === 4) { return page(['saved-card'], true); }
      throw new Error('Loaded another page after restoring the anchor');
    });

    const RestoringFeed = () => {
      useMediaScrollRestoration(cacheKey);
      return <InfiniteMediaScroll cacheKey={cacheKey} initialOffset={0} itemsPerPage={2}>
        {({ photos }) => photos.map(photo => <span key={photo.id} data-media-id={photo.id}>
          {photo.id}
        </span>)}
      </InfiniteMediaScroll>;
    };
    const height = jest.spyOn(document.documentElement, 'scrollHeight', 'get')
      .mockReturnValue(11_000);
    const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const layout = jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function(this: HTMLElement) {
        return this.dataset.mediaId === 'saved-card' ? 9_000 : 0;
      });
    ensureLegacyHistoryTracking();
    const key = scrollStorageKey();
    window.sessionStorage.setItem(key, JSON.stringify({
      top: 300, anchorId: 'saved-card', anchorOffset: 40,
    }));
    try {
      render(<SWRConfig value={{ provider: () => new Map() }}>
        <RestoringFeed />
      </SWRConfig>);
      expect(await screen.findByText('saved-card')).toBeTruthy();
      await waitFor(() => {
        expect(scroll).toHaveBeenLastCalledWith({ top: 8960, behavior: 'auto' });
        expect(document.documentElement.dataset.mediaScrollRestoring).toBeUndefined();
      });
      expect(fetchMedia.mock.calls.map(([options]) => options.offset))
        .toEqual([0, 2, 4]);
    } finally {
      layout.mockRestore();
      height.mockRestore();
      scroll.mockRestore();
      window.sessionStorage.removeItem(key);
    }
  });
});
