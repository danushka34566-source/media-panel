export const getCompatibilityPlaybackUrl = (
  sourceUrl: string,
  extension = 'mp4',
) => {
  const compatibilityFileName = (fileName: string) => {
    const previewBase = fileName.replace(/-preview\.[^.]+$/i, '');
    const base = previewBase !== fileName
      ? previewBase
      : (
        fileName.includes('.')
          ? fileName.substring(0, fileName.lastIndexOf('.'))
          : fileName
      );
    return `${base}-stream.${extension}`;
  };

  try {
    const url = new URL(sourceUrl);
    const fileName = url.pathname.split('/').pop() || '';
    url.pathname = url.pathname.replace(
      fileName,
      compatibilityFileName(fileName),
    );
    return url.toString();
  } catch {
    const [pathOnly, query] = sourceUrl.split('?');
    const parts = (pathOnly || sourceUrl).split('/');
    const fileName = parts.pop() || '';
    const url = [...parts, compatibilityFileName(fileName)].join('/');
    return query ? `${url}?${query}` : url;
  }
};

export const isMatroskaPlaybackUrl = (sourceUrl: string) => {
  const withoutQuery = sourceUrl.split(/[?#]/, 1)[0] ?? '';
  return withoutQuery.toLocaleLowerCase().endsWith('.mkv');
};

export const shouldPreferCompatibilityPlayback = ({
  sourceUrl,
  nativeMatroskaSupport,
}: {
  sourceUrl: string
  nativeMatroskaSupport: CanPlayTypeResult
}) => isMatroskaPlaybackUrl(sourceUrl) &&
  nativeMatroskaSupport === '';

export const selectInitialVideoPlaybackUrl = ({
  sourceUrl,
  compatibilityUrl,
  nativeMatroskaSupport,
}: {
  sourceUrl: string
  compatibilityUrl?: string
  nativeMatroskaSupport: CanPlayTypeResult
}) => compatibilityUrl && shouldPreferCompatibilityPlayback({
  sourceUrl,
  nativeMatroskaSupport,
})
  ? compatibilityUrl
  : sourceUrl;
