import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Media } from '@/media';
import MediaLarge from '@/media/MediaLarge';

let mockVideoPreviewMode: 'smart' | 'off' = 'off';

jest.mock('next/navigation', () => ({
  usePathname: () => '/full',
  useRouter: () => ({}),
}));
jest.mock('camelcase-keys', () => ({
  __esModule: true,
  default: (value: unknown) => value,
}));
jest.mock('../src/app/AppState', () => ({
  useAppState: () => ({ videoPreviewMode: mockVideoPreviewMode }),
}));
jest.mock('../src/admin/AdminMediaMenu', () => () => null);
jest.mock('../src/media/actions', () => ({}));
jest.mock('../src/share/ShareButton', () => () => null);
jest.mock('../src/utility/useElementHeight', () => () => 0);
jest.mock('../src/tag', () => ({
  TAG_PRIVATE: 'private',
  sortTagsArray: () => [],
}));
jest.mock('../src/auth/usePersonalFavorite', () => ({
  __esModule: true,
  default: () => ({}),
  usePersonalFavoriteIds: () => ({}),
}));

const photo = {
  id: 'video-under-test',
  mediaType: 'video',
  url: '/source.mp4',
  aspectRatio: 1.78,
  tags: [],
  categories: [],
  contentType: [],
  performers: [],
} as unknown as Media;

it('offers Document PiP and requests its window on the original click', async () => {
  const requestWindow = jest.fn().mockRejectedValue(new Error('Window blocked'));
  Object.defineProperty(window, 'documentPictureInPicture', {
    configurable: true, value: { requestWindow },
  });
  try {
    render(<MediaLarge photo={photo} showTitle={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Picture in Picture' }));
      expect(requestWindow).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/picture in picture did not open/i)).toBeTruthy();
  } finally {
    Reflect.deleteProperty(window, 'documentPictureInPicture');
  }
});

it('ignores an obsolete play rejection after retrying the same URL', async () => {
  jest.useFakeTimers();
  let rejectInitialPlay!: (error: Error) => void;
  const initialPlay = new Promise<void>((_, reject) => {
    rejectInitialPlay = reject;
  });
  const play = jest.mocked(HTMLMediaElement.prototype.play);
  const load = jest.mocked(HTMLMediaElement.prototype.load);
  load.mockClear();
  play.mockImplementationOnce(() => initialPlay);
  try {
    const { container } = render(<MediaLarge
      photo={photo}
      showTitle={false}
      preloadFullVideoDownload={false}
      resolveOptimizedPlaybackUrl={false}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));

    const video = container.querySelector('video[controls]')!;
    let readyState: number = HTMLMediaElement.HAVE_NOTHING;
    Object.defineProperty(video, 'readyState', { get: () => readyState });
    Object.defineProperty(video, 'error', { value: { code: 2 } });
    fireEvent.error(video);
    expect(load).toHaveBeenCalledTimes(1);
    expect(video.getAttribute('src')).toBe('/source.mp4');
    expect(container.querySelector('video[controls]')).toBe(video);

    readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    await act(async () => {
      rejectInitialPlay(new DOMException('Replaced by load()', 'AbortError'));
    });
    expect(screen.queryByText(/press play in the video controls/i)).toBeNull();

    readyState = HTMLMediaElement.HAVE_NOTHING;
    act(() => { jest.advanceTimersByTime(15_000); });
    expect(screen.getByRole('button', { name: 'Retry video' })).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

it('mounts a priority feed preview only while its card is visible', () => {
  let setVisibility: ((visible: boolean) => void) | undefined;
  class TestIntersectionObserver {
    constructor(private callback: IntersectionObserverCallback,
      private options?: IntersectionObserverInit) {}

    observe(target: Element) {
      if (this.options?.rootMargin !== '0px') { return; }
      setVisibility = visible => this.callback([{
        target,
        isIntersecting: visible,
        intersectionRatio: visible ? 1 : 0,
      } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }

    unobserve() {}
    disconnect() {}
  }
  const previousObserver = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
  const previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true, value: TestIntersectionObserver,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => Object.assign(new EventTarget(), { matches: false }),
  });
  jest.useFakeTimers();
  mockVideoPreviewMode = 'smart';
  try {
    const view = render(<MediaLarge
      photo={{ ...photo, previewUrl: '/preview.mp4' }}
      priority
      showTitle={false}
      preloadFullVideoDownload={false}
    />);
    const preview = () => view.container.querySelector('video[src="/preview.mp4"]');
    expect(preview()).toBeNull();

    expect(setVisibility).toBeDefined();
    act(() => setVisibility!(true));
    expect(preview()?.hasAttribute('autoplay')).toBe(true);

    act(() => setVisibility!(false));
    expect(preview()?.hasAttribute('autoplay')).toBe(false);
    act(() => { jest.advanceTimersByTime(20); });
    expect(preview()).toBeNull();
    view.unmount();
  } finally {
    mockVideoPreviewMode = 'off';
    jest.useRealTimers();
    if (previousObserver) {
      Object.defineProperty(window, 'IntersectionObserver', previousObserver);
    } else { Reflect.deleteProperty(window, 'IntersectionObserver'); }
    if (previousMatchMedia) {
      Object.defineProperty(window, 'matchMedia', previousMatchMedia);
    } else { Reflect.deleteProperty(window, 'matchMedia'); }
  }
});
