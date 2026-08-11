import { getMediaMetaCached } from '@/media/cache';
import { Album } from '.';
import { getMedia } from '@/media/query';

export const getMediaAlbumDataCached = ({
  album,
  limit,
}: {
  album: Album,
  limit?: number,
}) =>
  Promise.all([
    getMedia({ album, limit }),
    getMediaMetaCached({ album }),
  ]);

