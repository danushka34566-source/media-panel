import { fireEvent, render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import InfiniteMediaScroll from '@/media/InfiniteMediaScroll';
import useMediaScrollRestoration from '@/media/useMediaScrollRestoration';
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
