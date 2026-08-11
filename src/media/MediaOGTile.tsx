'use client';

import {
  Media,
  descriptionForMedia,
  getMediaPosterUrl,
  getMediaPreviewUrl,
  titleForMedia,
} from '@/media';
import { MediaSetCategory } from '../category';
import { pathForMedia, pathForMediaImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';

export default function MediaOGTile({
  photo,
  riseOnHover,
  retryTime,
  onVisible,
  ...categories
}: {
  photo: Media
} & MediaSetCategory & OGTilePropsCore) {
  const posterSrc = getMediaPosterUrl(photo);
  const previewSrc = getMediaPreviewUrl(photo);

  return (
    <OGTile {...{
      title: (titleForMedia(photo) || '').toLocaleUpperCase(),
      description: descriptionForMedia(photo),
      path: pathForMedia({ photo, ...categories }),
      pathImage: pathForMediaImage(photo),
      ...(photo.mediaType === 'video' && (previewSrc || posterSrc)
        ? { videoSrc: previewSrc, poster: posterSrc }
        : {}),
      riseOnHover,
      retryTime,
      onVisible,
    }} />
  );
};
