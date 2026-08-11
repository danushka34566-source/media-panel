import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaRecentsDataCached = ({
  limit,
}: {
  limit?: number,
}) =>
  Promise.all([
    getMediaCached({ recent: true, limit }),
    getMediaMetaCached({ recent: true }),
  ]);
