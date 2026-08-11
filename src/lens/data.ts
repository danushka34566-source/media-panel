import { formatLensParams, lensFromMedia } from '.';
import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaLensDataCached = async (
  make: string | undefined,
  model: string,
  limit: number,
) => {
  const lens = formatLensParams({ make, model });
  return Promise.all([
    getMediaCached({ lens, limit }),
    getMediaMetaCached({ lens }),
  ])
    .then(([photos, meta]) => [
      photos,
      meta,
      lensFromMedia(photos[0], lens),
    ] as const);
};
