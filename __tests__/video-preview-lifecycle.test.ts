import useVideoPreviewLifecycle, {
  canAutoplayGeneratedVideoPreview,
  canAutoplayLargeVideoPreview,
  getPreviewStartupConcurrency,
  setFullVideoPlaybackActive,
  shouldSuspendVideoPreviews,
} from '@/media/video-preview-lifecycle';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, useRef } from 'react';

class MockIntersectionObserver {
  static instance: MockIntersectionObserver | undefined;
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instance = this;
  }

  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);
  root = null;
  rootMargin = '0px';
  thresholds = [0, 0.25, 0.5, 0.75, 1];

  trigger(element: Element, intersectionRatio: number) {
    this.callback([{
      target: element,
      isIntersecting: intersectionRatio > 0,
      intersectionRatio,
      boundingClientRect: element.getBoundingClientRect(),
      intersectionRect: element.getBoundingClientRect(),
      rootBounds: null,
      time: performance.now(),
    }], this as unknown as IntersectionObserver);
  }
}

function PreviewProbe({
  id = 'card',
  enabled = true,
  preloadEnabled,
  preloadUrl,
  mountOnlyWhenVisible = false,
  requiresCapableDevice = false,
  activeGroupId,
  sequenceStartup = false,
  startupPriority = false,
}: {
  id?: string
  enabled?: boolean
  preloadEnabled?: boolean
  preloadUrl?: string
  mountOnlyWhenVisible?: boolean
  requiresCapableDevice?: boolean
  activeGroupId?: string
  sequenceStartup?: boolean
  startupPriority?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null);
  const {
    activationId,
    isActive,
    markPrepared,
    shouldMount,
  } = useVideoPreviewLifecycle({
    ref,
    enabled,
    preloadEnabled,
    preloadUrl,
    mountOnlyWhenVisible,
    requiresCapableDevice,
    activeGroupId,
    sequenceStartup,
    startupPriority,
  });
  return createElement(
    'div',
    { ref, 'data-testid': id, 'data-activation-id': activationId },
    createElement('img', { alt: 'Poster' }),
    shouldMount
      ? createElement('video', {
        'data-testid': `${id}-preview`,
        'data-active': String(isActive),
        onLoadedData: markPrepared,
      })
      : null,
  );
}

describe('video preview lifecycle policy', () => {
  it('only suspends previews for active fullscreen playback', () => {
    expect(shouldSuspendVideoPreviews({
      isMainVideoActuallyPlaying: true,
      isVideoFullscreen: false,
    })).toBe(false);
    expect(shouldSuspendVideoPreviews({
      isMainVideoActuallyPlaying: true,
      isVideoFullscreen: true,
    })).toBe(true);
  });
  it('disables previews for reduced motion', () => {
    expect(canAutoplayGeneratedVideoPreview({
      reducedMotion: true,
      saveData: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })).toBe(false);
  });

  it('respects Data Saver without numerically limiting normal playback', () => {
    expect(canAutoplayGeneratedVideoPreview({
      reducedMotion: false,
      saveData: true,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })).toBe(false);
    expect(canAutoplayGeneratedVideoPreview({
      reducedMotion: false,
      saveData: false,
      deviceMemory: 4,
      hardwareConcurrency: 4,
    })).toBe(true);
  });

  it('allows full-video fallback only on capable desktops', () => {
    expect(canAutoplayLargeVideoPreview({
      reducedMotion: false,
      saveData: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
      isMobile: false,
    })).toBe(true);
    expect(canAutoplayLargeVideoPreview({
      reducedMotion: false,
      saveData: false,
      deviceMemory: 4,
      hardwareConcurrency: 8,
      isMobile: false,
    })).toBe(true);
    expect(canAutoplayLargeVideoPreview({
      reducedMotion: false,
      saveData: true,
      deviceMemory: 8,
      hardwareConcurrency: 8,
      isMobile: false,
    })).toBe(false);
  });

  it('keeps playing while visible and unmounts after leaving the viewport', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    });
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });

    const { unmount } = render(createElement(PreviewProbe));
    const card = screen.getByTestId('card');
    expect(screen.getByAltText('Poster')).toBeTruthy();
    expect(screen.queryByTestId('card-preview')).toBeNull();

    act(() => {
      MockIntersectionObserver.instance?.trigger(card, 0);
    });
    expect(screen.queryByTestId('card-preview')).toBeNull();

    act(() => {
      MockIntersectionObserver.instance?.trigger(card, 0.01);
    });
    expect(screen.getByTestId('card-preview')).toBeTruthy();
    expect(screen.getByAltText('Poster')).toBeTruthy();
    expect(card.getAttribute('data-activation-id')).toBe('1');

    act(() => window.dispatchEvent(new Event('scroll')));
    expect(screen.getByTestId('card-preview')).toBeTruthy();
    expect(screen.getByAltText('Poster')).toBeTruthy();

    act(() => {
      MockIntersectionObserver.instance?.trigger(card, 0);
    });
    expect(screen.queryByTestId('card-preview')).toBeNull();
    expect(card.getAttribute('data-activation-id')).toBe('1');

    act(() => {
      MockIntersectionObserver.instance?.trigger(card, 0.01);
    });
    expect(screen.getByTestId('card-preview')).toBeTruthy();
    expect(card.getAttribute('data-activation-id')).toBe('2');

    unmount();
  });

  it('remounts visible previews after a mobile lock and resume', () => {
    const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
    const rectSpy = jest.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      bottom: 300,
      height: 200,
      left: 0,
      right: 300,
      top: 100,
      width: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const { unmount } = render(createElement(PreviewProbe));
    const card = screen.getByTestId('card');
    act(() => {
      MockIntersectionObserver.instance?.trigger(card, 0.8);
    });
    expect(screen.getByTestId('card-preview')).toBeTruthy();

    act(() => {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.queryByTestId('card-preview')).toBeNull();

    act(() => {
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByTestId('card-preview')).toBeTruthy();
    expect(card.getAttribute('data-activation-id')).toBe('2');

    unmount();
    rectSpy.mockRestore();
    if (originalHidden) {
      Object.defineProperty(document, 'hidden', originalHidden);
    } else {
      delete (document as { hidden?: boolean }).hidden;
    }
  });

  it('releases stale full-player suppression when grid previews mount', () => {
    const rectSpy = jest.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      bottom: 300,
      height: 200,
      left: 0,
      right: 300,
      top: 100,
      width: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const first = render(createElement(PreviewProbe, { id: 'full-card' }));
    expect(screen.getByTestId('full-card-preview')).toBeTruthy();

    act(() => setFullVideoPlaybackActive(true));
    expect(screen.queryByTestId('full-card-preview')).toBeNull();
    first.unmount();

    const grid = render(createElement(PreviewProbe, { id: 'grid-card' }));
    expect(screen.getByTestId('grid-card-preview')).toBeTruthy();

    grid.unmount();
    setFullVideoPlaybackActive(false);
    rectSpy.mockRestore();
  });

  it('does not treat persistent picture-in-picture as fullscreen', () => {
    const pictureInPictureDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'pictureInPictureElement',
    );
    const pipVideo = document.createElement('video');
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      value: pipVideo,
    });
    const rectSpy = jest.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      bottom: 300,
      height: 200,
      left: 0,
      right: 300,
      top: 100,
      width: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const preview = render(createElement(PreviewProbe, { id: 'pip-card' }));

    act(() => setFullVideoPlaybackActive(true));
    expect(screen.queryByTestId('pip-card-preview')).toBeNull();
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(screen.getByTestId('pip-card-preview')).toBeTruthy();

    preview.unmount();
    setFullVideoPlaybackActive(false);
    rectSpy.mockRestore();
    if (pictureInPictureDescriptor) {
      Object.defineProperty(
        document,
        'pictureInPictureElement',
        pictureInPictureDescriptor,
      );
    } else {
      delete (document as { pictureInPictureElement?: Element })
        .pictureInPictureElement;
    }
  });

  it('mounts every visible generated preview without a numeric cap', () => {
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    });
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });

    const { unmount } = render(createElement(
      'section',
      {},
      ...Array.from({ length: 12 }, (_, index) =>
        createElement(PreviewProbe, {
          id: `card-${index}`,
          key: index,
        })),
    ));
    const cards = screen.getAllByTestId(/^card-\d+$/);
    act(() => cards.forEach(card => {
      MockIntersectionObserver.instance?.trigger(card, 0.8);
    }));

    expect(screen.getAllByTestId(/^card-\d+-preview$/)).toHaveLength(12);
    expect(screen.getAllByAltText('Poster')).toHaveLength(12);
    unmount();
  });

  it('uses five preview startup decoders on every device class', () => {
    expect(getPreviewStartupConcurrency({
      reducedMotion: false,
      saveData: false,
      hardwareConcurrency: 16,
      isMobile: true,
    })).toBe(5);
    expect(getPreviewStartupConcurrency({
      reducedMotion: false,
      saveData: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
      isMobile: false,
    })).toBe(5);
    expect(getPreviewStartupConcurrency({
      reducedMotion: true,
      saveData: true,
      hardwareConcurrency: 2,
      isMobile: false,
    })).toBe(5);
  });

  it('starts five decoders with interaction first and activates decoded videos immediately', () => {
    const { unmount } = render(createElement(
      'section',
      {},
      ...Array.from({ length: 7 }, (_, index) =>
        createElement(PreviewProbe, {
          activeGroupId: 'grid-startup',
          id: `sequence-${index}`,
          key: index,
          sequenceStartup: true,
          startupPriority: index === 6,
        })),
    ));
    const cards = screen.getAllByTestId(/^sequence-\d+$/);
    act(() => cards.forEach(card => {
      MockIntersectionObserver.instance?.trigger(card, 0.8);
    }));

    expect(screen.getAllByTestId(/^sequence-\d+-preview$/)).toHaveLength(5);
    expect(screen.getByTestId('sequence-6-preview')
      .getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('sequence-0-preview')).toBeTruthy();
    expect(screen.getByTestId('sequence-3-preview')).toBeTruthy();
    expect(screen.queryByTestId('sequence-4-preview')).toBeNull();
    expect(screen.queryByTestId('sequence-5-preview')).toBeNull();

    fireEvent.loadedData(screen.getByTestId('sequence-6-preview'));
    expect(screen.getByTestId('sequence-6-preview')
      .getAttribute('data-active')).toBe('true');
    act(() => MockIntersectionObserver.instance?.trigger(cards[0], 0.8));
    expect(screen.getAllByTestId(/^sequence-\d+-preview$/)).toHaveLength(6);
    unmount();
  });

  it('shares the five-decoder budget across visible grid batches', () => {
    const { unmount } = render(createElement(
      'section',
      {},
      ...Array.from({ length: 6 }, (_, index) => createElement(PreviewProbe, {
        activeGroupId: `batch-${index}`,
        id: `batch-${index}-card`,
        key: index,
        sequenceStartup: true,
      })),
    ));
    const cards = screen.getAllByTestId(/^batch-\d-card$/);
    act(() => cards.forEach(card => {
      MockIntersectionObserver.instance?.trigger(card, 0.8);
    }));

    expect(screen.getAllByTestId(/^batch-\d-card-preview$/)).toHaveLength(5);
    fireEvent.loadedData(screen.getByTestId('batch-0-card-preview'));
    expect(screen.getByTestId('batch-0-card-preview')
      .getAttribute('data-active')).toBe('true');
    act(() => MockIntersectionObserver.instance?.trigger(cards[0], 0.8));
    expect(screen.getAllByTestId(/^batch-\d-card-preview$/)).toHaveLength(6);
    unmount();
  });

  it('mounts every visible capable-device fallback without a numeric cap', () => {
    const { unmount } = render(createElement(
      'section',
      {},
      ...Array.from({ length: 5 }, (_, index) =>
        createElement(PreviewProbe, {
          id: `large-${index}`,
          key: index,
          requiresCapableDevice: true,
        })),
    ));
    const cards = screen.getAllByTestId(/^large-\d$/);
    act(() => cards.forEach(card => {
      MockIntersectionObserver.instance?.trigger(card, 0.8);
    }));

    expect(screen.getAllByTestId(/^large-\d-preview$/)).toHaveLength(5);
    unmount();
  });

  it('mounts the real preview ahead of the viewport without activating it', () => {
    const rect = {
      bottom: 300,
      height: 200,
      left: 0,
      right: 300,
      top: 100,
      width: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    };
    const rectSpy = jest.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue(rect);
    const { unmount } = render(createElement(PreviewProbe, {
      enabled: false,
      preloadEnabled: true,
      preloadUrl: 'https://example.com/preview.mp4',
    }));

    const preview = screen.getByTestId('card-preview');
    expect(preview.getAttribute('data-active')).toBe('false');
    expect(document.body.querySelector(
      'video[data-media-preview-warmup="true"]',
    )).toBeNull();

    act(() => window.dispatchEvent(new Event('scroll')));
    expect(screen.getByTestId('card-preview')).toBe(preview);

    unmount();
    rectSpy.mockRestore();
  });

  it('does not warm detail previews outside the viewport', () => {
    const rect = {
      bottom: 300,
      height: 200,
      left: 0,
      right: 300,
      top: 100,
      width: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    };
    const rectSpy = jest.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue(rect);
    const { unmount } = render(createElement(PreviewProbe, {
      enabled: false,
      preloadEnabled: true,
      preloadUrl: 'https://example.com/preview.mp4',
      mountOnlyWhenVisible: true,
    }));

    expect(screen.queryByTestId('card-preview')).toBeNull();

    unmount();
    rectSpy.mockRestore();
  });
});
