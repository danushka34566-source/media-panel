import { capitalizeWords, parameterize } from '@/utility/string';
import {
  addMediaAlbumId,
  clearMediaAlbumIds,
  getAlbumsWithMeta,
  insertAlbum,
} from './query';
import { deleteMediaTagGlobally, getMedia } from '@/media/query';

export const createAlbumsAndGetIds = async (titles: string[]) => {
  const albums = await getAlbumsWithMeta();
  return Promise.all(titles.map(async title => {
    const album = albums.find(({ album }) => album.title === title);
    if (album) {
      return album.album.id;
    } else {
      const albumInsert = { title, slug: parameterize(title) };
      return insertAlbum(albumInsert);
    }
  }));
};

export const addAlbumTitlesToMedia = async (
  albumTitles: string[],
  photoId: string,
  shouldClearMediaAlbumIds = true,
) => {
  const albumIds = await createAlbumsAndGetIds(albumTitles);
  if (shouldClearMediaAlbumIds) { await clearMediaAlbumIds(photoId); }
  await Promise.all(albumIds.map(albumId => addMediaAlbumId(photoId, albumId)));
};

export const upgradeTagToAlbum = async (tag: string) => {
  const title = capitalizeWords(tag.replaceAll('-', ' '));
  const slug = tag;
  const photos = await getMedia({ tag });
  if (photos.length > 0) {
    const albumId = await insertAlbum({ title, slug });
    if (albumId) {
      return Promise
        .all(photos.map(photo => addMediaAlbumId(photo.id, albumId)))
        .then(() => deleteMediaTagGlobally(tag))
        .then(() => albumId);
    }
    return Promise.reject(
      new Error(`Failed to upgrade tag "${tag}" to album`),
    );
  }
};
