import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaTagDataCached = ({
  tag,
  limit,
}: {
  tag: string,
  limit?: number,
}) =>
  Promise.all([
    getMediaCached({ tag, limit }),
    getMediaMetaCached({ tag }),
  ]);

