import { cameraFromMedia, formatCameraParams } from '.';
import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaCameraDataCached = async (
  make: string,
  model: string,
  limit: number,
) => {
  const camera = formatCameraParams({ make, model });
  return Promise.all([
    getMediaCached({ camera, limit }),
    getMediaMetaCached({ camera }),
  ])
    .then(([photos, meta]) => [
      photos,
      meta,
      cameraFromMedia(photos[0], camera),
    ] as const);
};
