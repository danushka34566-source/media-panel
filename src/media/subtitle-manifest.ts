const withoutQuery = (value: string) => value.split(/[?#]/, 1)[0];

export type SubtitleTrack = {
  src: string
  lang: string
  label?: string
}

export const getSubtitleProxyManifestUrl = (mediaId: string) =>
  `/api/subtitles/${encodeURIComponent(mediaId)}`;

export const parseSubtitleManifest = (value: unknown): SubtitleTrack[] => {
  if (!value || typeof value !== 'object' ||
    !Array.isArray((value as { tracks?: unknown }).tracks)) {
    return [];
  }
  return (value as { tracks: unknown[] }).tracks.flatMap((track, index) => {
    if (!track || typeof track !== 'object') { return []; }
    const { src, lang, label } = track as Record<string, unknown>;
    if (typeof src !== 'string' || src.trim().length === 0) { return []; }
    return [{
      src,
      lang: typeof lang === 'string' && lang.trim().length > 0
        ? lang
        : 'und',
      label: typeof label === 'string' && label.trim().length > 0
        ? label
        : `Subtitle ${index + 1}`,
    }];
  });
};

const derivativeBase = (value?: string) => {
  if (!value) { return undefined; }
  const clean = withoutQuery(value);
  const derivative = clean.replace(/-(poster|preview)\.[^./]+$/i, '');
  if (derivative !== clean) { return derivative; }
  return clean.replace(/\.[^./]+$/, '');
};

export const getSubtitleManifestBaseUrl = ({
  originalUrl,
  posterUrl,
  previewUrl,
}: {
  originalUrl: string
  posterUrl?: string
  previewUrl?: string
}) => derivativeBase(posterUrl) ||
  derivativeBase(previewUrl) ||
  derivativeBase(originalUrl) ||
  originalUrl;
