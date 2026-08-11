import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaYearDataCached = ({
  year,
  limit,
}: {
  year: string,
  limit?: number,
}) =>
  Promise.all([
    getMediaCached({ year, limit }),
    getMediaMetaCached({ year }),
  ]);
