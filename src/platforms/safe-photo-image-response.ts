import { Media, getMediaThumbnailUrl } from '@/media';
import { ImageResponse } from 'next/og';
import { JSX } from 'react';
import { IS_PREVIEW } from '@/app/config';
import { getOptimizedMediaUrl } from '@/media/storage';

const isNextImageReadyBasedOnMedia = async (
  photos: Media[],
): Promise<boolean> =>
  photos.length > 0 &&
  fetch(getOptimizedMediaUrl({
    imageUrl: getMediaThumbnailUrl(photos[0]),
    size: 640,
    addBypassSecret: IS_PREVIEW,
  }))
    .then(response => response.ok)
    .catch(() => false);

export const safeMediaImageResponse = async (
  photos: Media[],
  jsx: (isNextImageReady: boolean) => JSX.Element,
  options: ConstructorParameters<typeof ImageResponse>[1],
) => {
  // Make sure next/image can be reached from absolute urls,
  // which may not exist on first pre-render
  const isNextImageReady = await isNextImageReadyBasedOnMedia(photos);

  return new ImageResponse(
    jsx(isNextImageReady),
    options,
  );
};
