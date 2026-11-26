import {
  getCompatibilityPlaybackUrl,
  isMatroskaPlaybackUrl,
  selectInitialVideoPlaybackUrl,
  selectRetryVideoPlaybackUrl,
  shouldPreferCompatibilityPlayback,
} from '@/media/compatibility-playback';

describe('getCompatibilityPlaybackUrl', () => {
  it('derives a stream URL from an original video', () => {
    expect(getCompatibilityPlaybackUrl(
      'https://storage.example/media/319492365194.mkv',
    )).toBe('https://storage.example/media/319492365194-stream.mp4');
  });

  it(
    'derives a stream URL from a generated preview and preserves queries',
    () => {
      expect(getCompatibilityPlaybackUrl(
        'https://storage.example/media/319492365194-preview.mp4?token=abc',
      )).toBe(
        'https://storage.example/media/319492365194-stream.mp4?token=abc',
      );
    },
  );

  it('supports relative storage URLs and alternate stream extensions', () => {
    expect(getCompatibilityPlaybackUrl(
      '/media/319492365194-preview.mp4?download=1',
      'webm',
    )).toBe('/media/319492365194-stream.webm?download=1');
  });

  it('recognizes Matroska URLs with case and query parameters', () => {
    expect(isMatroskaPlaybackUrl('/media/video.MKV?token=abc')).toBe(true);
    expect(isMatroskaPlaybackUrl('/media/video.mp4')).toBe(false);
  });

  it('starts with compatibility for unsupported Matroska', () => {
    expect(shouldPreferCompatibilityPlayback({
      sourceUrl: '/media/video.mkv',
      nativeMatroskaSupport: '',
    })).toBe(true);
    expect(shouldPreferCompatibilityPlayback({
      sourceUrl: '/media/video.mkv',
      nativeMatroskaSupport: 'maybe',
    })).toBe(false);
    expect(shouldPreferCompatibilityPlayback({
      sourceUrl: '/media/video.mkv',
      nativeMatroskaSupport: '',
    })).toBe(true);
  });

  it('selects the generated MP4 without an availability fetch', () => {
    expect(selectInitialVideoPlaybackUrl({
      sourceUrl: '/media/video.mkv',
      compatibilityUrl: '/media/video-stream.mp4',
      nativeMatroskaSupport: '',
    })).toBe('/media/video-stream.mp4');
  });

  it('derives the stream in place when the filename repeats in its parent path', () => {
    expect(getCompatibilityPlaybackUrl('https://example.org/video.mp4/video.mp4'))
      .toBe('https://example.org/video.mp4/video-stream.mp4');
  });

  const original = '/storage/xhub/video.MP4';
  const compatibility = '/storage/xhub/video-stream.mp4';
  const retry = (errorCode: number, tried: string[] = [], usingCompatibility = false) =>
    selectRetryVideoPlaybackUrl({
      sourceUrl: original,
      compatibilityUrl: compatibility,
      wasUsingCompatibility: usingCompatibility,
      errorCode,
      retriedUrls: new Set(tried),
    });

  it('reopens an interrupted transfer once, then tries the other source', () => {
    expect(retry(2)).toBe(original);
    expect(retry(2, [original])).toBe(compatibility);
    expect(retry(2, [original, compatibility])).toBeUndefined();
  });

  it('tries a different encoding on decode or unsupported-source errors', () => {
    expect(retry(3)).toBe(compatibility);
    expect(retry(4, [], true)).toBe(original);
  });

  it('ignores an aborted request', () => {
    expect(retry(1)).toBeUndefined();
  });
});
