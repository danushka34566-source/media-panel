import {
  Media,
  MediaDateRangePostgres,
  descriptionForMediaSet,
  photoQuantityText,
} from '@/media';
import { Camera, cameraFromMedia, formatCameraText } from '.';
import {
  absolutePathForCamera,
  absolutePathForCameraImage,
} from '@/app/path';
import { AppTextState } from '@/i18n/state';

// Meta functions moved to separate file to avoid
// dependencies (camelcase-keys) found in photo/index.ts
// which cause Jest to crash

export const titleForCamera = (
  camera: Camera,
  photos: Media[],
  appText: AppTextState,
  explicitCount?: number,
) => [
  appText.category.cameraTitle(
    formatCameraText(cameraFromMedia(photos[0], camera)),
  ),
  photoQuantityText(explicitCount ?? photos.length, appText),
].join(' ');

export const shareTextForCamera = (
  camera: Camera,
  photos: Media[],
  appText: AppTextState,
) =>
  appText.category.cameraShare(
    formatCameraText(cameraFromMedia(photos[0], camera)),
  );

export const descriptionForCameraMedia = (
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

export const generateMetaForCamera = (
  camera: Camera,
  photos: Media[],
  appText: AppTextState,
  explicitCount?: number,
  explicitDateRange?: MediaDateRangePostgres,
) => ({
  url: absolutePathForCamera(camera),
  title: titleForCamera(camera, photos, appText, explicitCount),
  description:
    descriptionForCameraMedia(
      photos,
      appText,
      true,
      explicitCount,
      explicitDateRange,
    ),
  images: absolutePathForCameraImage(camera),
});
