import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaFilmDataCached = ({
  film,
  limit,
}: {
  film: string,
  limit?: number,
}) =>
  Promise.all([
    getMediaCached({ film, limit }),
    getMediaMetaCached({ film }),
  ]);
