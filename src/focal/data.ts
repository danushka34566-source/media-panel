import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaFocalLengthDataCached = ({
  focal,
  limit,
}: {
  focal: number,
  limit?: number,
}) =>
  Promise.all([
    getMediaCached({ focal, limit }),
    getMediaMetaCached({ focal }),
  ]);

