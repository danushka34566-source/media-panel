import {
  Media,
  MediaDateRangePostgres,
  descriptionForMediaSet,
  photoQuantityText,
} from '@/media';
import {
  absolutePathForFocalLength,
  absolutePathForFocalLengthImage,
} from '@/app/path';
import { AppTextState } from '@/i18n/state';
import { CategoryQueryMeta } from '@/category';

type FocalLengthWithMeta = { focal: number } & CategoryQueryMeta;

export type FocalLengths = FocalLengthWithMeta[];

export const getFocalLengthFromString = (focalString?: string) => {
  const focal = focalString?.match(/^([0-9]+)mm/)?.[1];
  return focal ? parseInt(focal, 10) : 0;
};

export const formatFocalLength = (focal = 0) =>
  `${focal}mm`;

export const titleForFocalLength = (
  focal: number,
  photos: Media[],
  appText: AppTextState,
  explicitCount?: number,
) => [
  appText.category.focalLengthTitle(formatFocalLength(focal)),
  photoQuantityText(explicitCount ?? photos.length, appText),
].join(' ');

export const shareTextFocalLength = (
  focal: number,
  appText: AppTextState,
) =>
  appText.category.focalLengthShare(formatFocalLength(focal));

export const descriptionForFocalLengthMedia = (
  photos: Media[],
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

export const generateMetaForFocalLength = (
  focal: number,
  photos: Media[],
  appText: AppTextState,
  explicitCount?: number,
  explicitDateRange?: MediaDateRangePostgres,
) => ({
  url: absolutePathForFocalLength(focal),
  title: titleForFocalLength(focal, photos, appText, explicitCount),
  description: descriptionForFocalLengthMedia(
    photos,
    appText,
    true,
    explicitCount,
    explicitDateRange,
  ),
  images: absolutePathForFocalLengthImage(focal),
});

export const sortFocalLengths = (focalLengths: FocalLengths) =>
  focalLengths.sort((a, b) => a.focal - b.focal);
