import { absolutePathForAlbum, absolutePathForAlbumImage } from '@/app/path';
import { CategoryQueryMeta } from '@/category';
import { AppTextState } from '@/i18n/state';
import {
  descriptionForMediaSet,
  Media,
  MediaDateRangePostgres,
  photoQuantityText,
} from '@/media';
import { Place } from '@/place';
import camelcaseKeys from 'camelcase-keys';

export interface Album {
  id: string
  title: string
  slug: string
  subhead?: string
  description?: string
  location?: Place
}

type AlbumWithMeta = {
  album: Album
} & CategoryQueryMeta;

export type Albums = AlbumWithMeta[];

export type AlbumOrAlbumSlug = Album | string;

export const parseAlbumFromDb = (album: any): Album =>
  camelcaseKeys(album);

export const albumHasMeta = (album: Album) =>
  album.subhead ||
  album.description ||
  album.location;

export const titleForAlbum = (
  album: Album,
  photos:Media[] = [],
  appText: AppTextState,
  explicitCount?: number,
) => [
  album.title,
  photoQuantityText(explicitCount ?? photos.length, appText),
].join(' ');

export const shareTextForAlbum = (
  album: Album,
  appText: AppTextState,
) => [
  `${appText.category.album}:`,
  album.title,
].join(' ');

export const descriptionForAlbumMedia = (
  photos: Media[] = [],
  appText: AppTextState,
  dateBased?: boolean,
  explicitCount?: number,
  explicitDateRange?: MediaDateRangePostgres,
) =>
  descriptionForMediaSet(
    photos,
    appText,
    undefined,
    dateBased,
    explicitCount,
    explicitDateRange,
  );

export const generateMetaForAlbum = (
  album: Album,
  photos: Media[],
  appText: AppTextState,
  explicitCount?: number,
  explicitDateRange?: MediaDateRangePostgres,
) => ({
  url: absolutePathForAlbum(album),
  title: titleForAlbum(album, photos, appText, explicitCount),
  description: descriptionForAlbumMedia(
    photos,
    appText,
    true,
    explicitCount,
    explicitDateRange,
  ),
  images: absolutePathForAlbumImage(album),
});

export const deleteAlbumConfirmationText = (
  album: Album,
  count: number,
  appText: AppTextState,
) =>
  `Are you sure you want to delete the "${album.title}" album, containing ` +
  `${photoQuantityText(count, appText, false, false).toLowerCase()}? ` +
  'No photos will be deleted.';
