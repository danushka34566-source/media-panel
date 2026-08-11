import {
  getCompatibilityPlaybackUrl,
  isMatroskaPlaybackUrl,
  selectInitialVideoPlaybackUrl,
  shouldPreferMobileCompatibilityPlayback,
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

  it('starts with compatibility only for unsupported mobile Matroska', () => {
    expect(shouldPreferMobileCompatibilityPlayback({
      sourceUrl: '/media/video.mkv',
      isMobile: true,
      nativeMatroskaSupport: '',
    })).toBe(true);
    expect(shouldPreferMobileCompatibilityPlayback({
      sourceUrl: '/media/video.mkv',
      isMobile: true,
      nativeMatroskaSupport: 'maybe',
    })).toBe(false);
    expect(shouldPreferMobileCompatibilityPlayback({
      sourceUrl: '/media/video.mkv',
      isMobile: false,
      nativeMatroskaSupport: '',
    })).toBe(false);
  });

  it('selects the generated MP4 without an availability fetch', () => {
    expect(selectInitialVideoPlaybackUrl({
      sourceUrl: '/media/video.mkv',
      compatibilityUrl: '/media/video-stream.mp4',
      isMobile: true,
      nativeMatroskaSupport: '',
    })).toBe('/media/video-stream.mp4');
  });
});
