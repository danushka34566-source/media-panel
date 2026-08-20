import {
  getFullVideoBufferPolicy,
  getFullVideoBufferedRanges,
  getFullVideoManifestUrl,
} from '@/media/full-video-playback';

describe('full video playback policy', () => {
  it('derives the flat HLS derivative while preserving signed query parameters', () => {
    expect(getFullVideoManifestUrl(
      'https://cdn.example/media/holiday.mkv?token=abc',
    )).toBe('https://cdn.example/media/holiday-hls.m3u8?token=abc');
  });

  it('uses bounded mobile and save-data targets', () => {
    const mobile = getFullVideoBufferPolicy({ effectiveType: '4g' }, true);
    const saveData = getFullVideoBufferPolicy({ saveData: true }, false);
    expect(mobile.forwardSeconds).toBeLessThan(120);
    expect(mobile.backwardSeconds).toBeLessThan(90);
    expect(saveData.maxForwardSeconds).toBeLessThan(mobile.maxForwardSeconds);
    expect(saveData.maxBufferBytes).toBeLessThan(mobile.maxBufferBytes);
  });

  it('reads the browser buffered time ranges without assuming one range', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      value: {
        length: 2,
        start: (index: number) => index === 0 ? 0 : 20,
        end: (index: number) => index === 0 ? 10 : 35,
      },
    });
    expect(getFullVideoBufferedRanges(video)).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 35 },
    ]);
  });
});
