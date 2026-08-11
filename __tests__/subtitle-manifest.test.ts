import {
  getSubtitleManifestBaseUrl,
  getSubtitleProxyManifestUrl,
  parseSubtitleManifest,
} from '@/media/subtitle-manifest';

describe('subtitle manifest location', () => {
  it('builds a same-origin subtitle proxy URL', () => {
    expect(getSubtitleProxyManifestUrl('media id'))
      .toBe('/api/subtitles/media%20id');
  });
  it('uses the root derivative base for originals stored in upload folders', () => {
    expect(getSubtitleManifestBaseUrl({
      originalUrl: 'https://storage.example/uploads/folder/124399888136.mkv',
      posterUrl: 'https://storage.example/124399888136-poster.jpg',
      previewUrl: 'https://storage.example/124399888136-preview.mp4',
    })).toBe('https://storage.example/124399888136');
  });

  it('falls back to the original base when no derivative exists', () => {
    expect(getSubtitleManifestBaseUrl({
      originalUrl: 'https://storage.example/video.mkv?token=1',
    })).toBe('https://storage.example/video');
  });

  it('keeps valid manifest tracks in order without requiring HEAD requests', () => {
    expect(parseSubtitleManifest({ tracks: [
      { src: 'track-1.vtt', lang: 'en', label: 'English' },
      { src: 'track-2.vtt', lang: 'si', label: 'Sinhala' },
    ] })).toEqual([
      { src: 'track-1.vtt', lang: 'en', label: 'English' },
      { src: 'track-2.vtt', lang: 'si', label: 'Sinhala' },
    ]);
  });

  it('normalizes incomplete tracks and rejects entries without a source', () => {
    expect(parseSubtitleManifest({ tracks: [
      { src: 'track-1.vtt' },
      { lang: 'en' },
    ] })).toEqual([{
      src: 'track-1.vtt',
      lang: 'und',
      label: 'Subtitle 1',
    }]);
  });
});
