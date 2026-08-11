/* eslint-disable jsx-a11y/alt-text */

import { Media, getMediaPosterUrl, isVideoMedia } from '@/media';
import { NextImageSize } from '@/platforms/next-image';
import { IS_PREVIEW } from '@/app/config';
import {
  doAllMediaHaveOptimizedFiles,
  getOptimizedMediaUrl,
} from '@/media/storage';

const canRenderRemoteImage = async (url?: string) => {
  if (!url) { return false; }
  try {
    const response = await fetch(url);
    if (!response.ok) { return false; }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('image/')) { return false; }
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(imageBuffer).metadata();
    return Boolean(metadata.width && metadata.height);
  } catch {
    return false;
  }
};

export default async function ImageMediaGrid({
  photos,
  width,
  widthArbitrary,
  height,
  imagePosition = 'center',
  gap = 0,
  imageStyle,
}: ({
  photos: Media[]
  height: number
  imagePosition?: 'center' | 'top'
  gap?: number
  imageStyle?: React.CSSProperties
} & (
  { width: NextImageSize, widthArbitrary?: undefined } |
  { width?: undefined, widthArbitrary: number }
))) {
  let count = photos.length;
  if (photos.length >= 12) { count = 12; }
  else if (photos.length >= 6) { count = 6; }
  else if (photos.length >= 4) { count = 4; }

  const hasSplitLayout = count === 3;

  const nextImageWidth: NextImageSize = count <= 2
    ? width ?? 1080
    : 640;

  let rows = 1;
  if (count > 12) { rows = 4; }
  else if (count > 6) { rows = 3; }
  else if (count >= 3) { rows = 2; }

  const imagesPerRow = Math.round(count / rows);

  const cellWidth = (
    (width ?? widthArbitrary) / imagesPerRow -
    (imagesPerRow - 1) * gap / (imagesPerRow)
  );
  const cellHeight= height / rows -
    (rows - 1) * gap / rows;

  const doOptimizedFilesExist = await doAllMediaHaveOptimizedFiles(photos);
  const photosToRender = photos.slice(0, count);
  const renderableMedia = await Promise.all(photosToRender.map(async photo => {
    const isVideo = isVideoMedia(photo);
    if (isVideo) {
      const posterSrc = getMediaPosterUrl(photo);
      return {
        photo,
        src: await canRenderRemoteImage(posterSrc) ? posterSrc : undefined,
      };
    }
    return {
      photo,
      src: getOptimizedMediaUrl({
        imageUrl: photo.url,
        size: nextImageWidth,
        addBypassSecret: IS_PREVIEW,
        compatibilityMode: !doOptimizedFilesExist,
      }),
    };
  }));

  const renderMedia = (
    {
      photo,
      src,
    }: {
      photo: Media
      src?: string
    },
    width: number,
    height: number,
  ) => {
    const isVideo = isVideoMedia(photo);

    if (isVideo && !src) {
      return (
        <div
          key={photo.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width,
            height,
            backgroundColor: '#111',
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Video
        </div>
      );
    }

    return (
      <div
        key={photo.id}
        style={{
          display: 'flex',
          width,
          height,
          overflow: 'hidden',
          filter: 'saturate(1.1)',
        }}
      >
        <img {...{
          src,
          style: {
            ...imageStyle,
            width: '100%',
            ...imagePosition === 'center' && {
              height: '100%',
            },
            objectFit: 'cover',
          },
        }} />
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
      }}
    >
      {hasSplitLayout
        ? <>
          {/* Large image (L) */}
          <div style={{
            display: 'flex',
            width: cellWidth,
            height: cellHeight * 2,
          }}>
            {renderMedia(renderableMedia[0], cellWidth, cellHeight * 2)}
          </div>
          {/* Small images (R) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: cellWidth,
            height: cellHeight,
          }}>
            {renderableMedia.slice(1).map(item =>
              renderMedia(item, cellWidth, cellHeight),
            )}
          </div>
        </>
        : renderableMedia.map(item =>
          renderMedia(item, cellWidth, cellHeight),
        )}
    </div>
  );
}
