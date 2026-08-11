import { getDisplayTranscodeStatus } from '@/media/processing-status';
import type { Media } from '@/media';

describe('video processing status', () => {
  it('keeps an active rebuild visible when older derivatives exist', () => {
    expect(getDisplayTranscodeStatus({
      mediaType: 'video',
      transcodeStatus: 'processing',
      posterUrl: 'https://storage.example/poster.jpg',
      previewUrl: 'https://storage.example/preview.mp4',
    } as Media)).toBe('processing');
  });

  it('hides only completed processing status', () => {
    expect(getDisplayTranscodeStatus({
      mediaType: 'video',
      transcodeStatus: 'ready',
    } as Media)).toBeUndefined();
  });
});
