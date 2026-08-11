import {
  descriptionForMedia,
  getMediaPlaybackUrl,
  getMediaPosterUrl,
  getMediaPreviewUrl,
  Media,
} from '@/media';

const PHOTO: Partial<Media> = {
  takenAt: new Date('2025-01-01 12:00:00'),
  mediaType: 'photo',
};

const PHOTO_SEMANTIC: Partial<Media> = {
  ...PHOTO,
  semanticDescription: 'Semantic Description',
};

const PHOTO_CAPTION: Partial<Media> = {
  ...PHOTO_SEMANTIC,
  caption: 'Caption',
};

describe('Should generate photo description', () => {
  it('with caption', () => {
    expect(descriptionForMedia(PHOTO_CAPTION as Media))
      .toBe('Caption');
  });
  it('with semantic description (disabled)', () => {
    expect(descriptionForMedia(PHOTO_SEMANTIC as Media))
      .toBe('01 JAN 2025 12:00PM');
  });
  it('with semantic description (enabled)', () => {
    expect(descriptionForMedia(PHOTO_SEMANTIC as Media, true))
      .toBe('Semantic Description');
  });
  it('with date', () => {
    expect(descriptionForMedia(PHOTO as Media))
      .toBe('01 JAN 2025 12:00PM');
  });
});

describe('Should generate video URLs', () => {
  const VIDEO: Partial<Media> = {
    id: 'video-id',
    mediaType: 'video',
    url: 'https://example.com/media/source.mp4',
    extension: 'mp4',
    takenAt: new Date('2025-01-01 12:00:00'),
    updatedAt: new Date('2025-01-01 12:00:00'),
    createdAt: new Date('2025-01-01 12:00:00'),
    takenAtNaive: '2025-01-01 12:00:00',
    takenAtNaiveFormatted: '01 JAN 2025 12:00PM',
    aspectRatio: 16 / 9,
    tags: [],
  };

  it('does not invent URLs for sidecars that processing has not stored', () => {
    const video = { ...VIDEO, transcodeStatus: 'pending' } as Media;

    expect(getMediaPosterUrl(video)).toBeUndefined();
    expect(getMediaPreviewUrl(video)).toBeUndefined();
  });

  it('uses the persisted generated sidecar URLs', () => {
    const video = {
      ...VIDEO,
      transcodeStatus: 'ready',
      posterUrl: 'https://example.com/media/source-poster.jpg',
      previewUrl: 'https://example.com/media/source-preview.mp4',
    } as Media;

    expect(getMediaPosterUrl(video))
      .toBe('https://example.com/media/source-poster.jpg');
    expect(getMediaPreviewUrl(video))
      .toBe('https://example.com/media/source-preview.mp4');
  });

  it('uses original video URL as playback fallback when transcode fails', () => {
    const video = { ...VIDEO, transcodeStatus: 'failed' } as Media;

    expect(getMediaPosterUrl(video)).toBeUndefined();
    expect(getMediaPreviewUrl(video)).toBeUndefined();
    expect(getMediaPlaybackUrl(video))
      .toBe('https://example.com/media/source.mp4');
  });
});
