import {
  Media,
  MediaDateRangePostgres,
  descriptionForMediaSet,
  photoQuantityText,
} from '@/media';
import { Lens, lensFromMedia, formatLensText } from '.';
import {
  absolutePathForLens,
  absolutePathForLensImage,
} from '@/app/path';
import { AppTextState } from '@/i18n/state';

// Meta functions moved to separate file to avoid
// dependencies (camelcase-keys) found in photo/index.ts
// which cause Jest to crash

export const titleForLens = (
  lens: Lens,
  photos: Media[],
  appText: AppTextState,
  explicitCount?: number,
) => [
  `${appText.category.lens}:`,
  formatLensText(lensFromMedia(photos[0], lens)),
  photoQuantityText(explicitCount ?? photos.length, appText),
].join(' ');

export const shareTextForLens = (
  lens: Lens,
  photos: Media[],
  appText: AppTextState,
) => [
  `${appText.category.lens}:`,
  formatLensText(lensFromMedia(photos[0], lens)),
].join(' ');

export const descriptionForLensMedia = (
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

export const generateMetaForLens = (
  lens: Lens,
  photos: Media[],
  appText: AppTextState,
  explicitCount?: number,
  explicitDateRange?: MediaDateRangePostgres,
) => ({
  url: absolutePathForLens(lens),
  title: titleForLens(lens, photos, appText, explicitCount),
  description:
    descriptionForLensMedia(
      photos,
      appText,
      true,
      explicitCount,
      explicitDateRange,
    ),
  images: absolutePathForLensImage(lens),
});
