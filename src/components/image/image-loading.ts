export const isImageLoaded = (
  image?: Pick<HTMLImageElement, 'complete' | 'naturalWidth'> | null,
) => Boolean(image?.complete && image.naturalWidth > 0);
