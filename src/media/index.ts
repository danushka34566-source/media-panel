import { formatFocalLength } from '@/focal';
import { photoHasFilmData } from '@/film';
import {
  SHOW_EXIF_DATA,
  SHOW_FILMS,
  SHOW_LENSES,
  SHOW_RECIPES,
} from '@/app/config';
import { ABSOLUTE_PATH_HOME_IMAGE } from '@/app/path';
import { formatDate, formatDateFromPostgresString } from '@/utility/date';
import {
  formatAperture,
  formatIso,
  formatExposureCompensation,
  formatExposureTime,
} from '@/utility/exif-format';
import { capitalize, parameterize } from '@/utility/string';
import camelcaseKeys from 'camelcase-keys';
import { isBefore } from 'date-fns';
import type { Metadata } from 'next';
import { FujifilmRecipe } from '@/platforms/fujifilm/recipe';
import { MediaUpdateStatus, generateMediaUpdateStatus } from './update';
import { AppTextState } from '@/i18n/state';
import { MediaColorData } from './color/client';
export { getDisplayTranscodeStatus } from './processing-status';

const normalizeStoredText = (value?: string | null) => {
  if (!value) { return undefined; }
  const trimmed = value.trim();
  if (!trimmed) { return undefined; }
  return trimmed;
};

const normalizeMediaUrlForMatching = (url?: string | null) => {
  if (!url) { return undefined; }
  return decodeURIComponent(url)
    .split('?')[0]
    .trim()
    .toLocaleLowerCase();
};

export const normalizeTitle = (value?: string | null) => {
  if (!value) { return undefined; }
  const trimmed = value.trim();
  if (!trimmed) { return undefined; }
  return trimmed;
};

// INFINITE SCROLL: GRID
export const INFINITE_SCROLL_GRID_INITIAL =
  process.env.NODE_ENV === 'development' ? 24 : 48;
export const INFINITE_SCROLL_GRID_MULTIPLE =
  process.env.NODE_ENV === 'development' ? 24 : 48;

// Thumbnails below large media detail pages.
export const RELATED_GRID_MEDIA_TO_SHOW = 12;

export const DEFAULT_ASPECT_RATIO = 1.5;

export const MEDIA_TYPES = ['photo', 'video'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const TRANSCODE_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type TranscodeStatus = (typeof TRANSCODE_STATUSES)[number];

export const ACCEPTED_IMAGE_FILE_TYPES: string[] = [
  'image/jpg',
  'image/jpeg',
  'image/png',
];

export const ACCEPTED_VIDEO_FILE_TYPES: string[] = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo',
  'video/mp2t',
  'video/mpeg',
  'video/x-ms-wmv',
  'video/x-flv',
  'video/3gpp',
  'video/ogg',
];

export const ACCEPTED_MEDIA_FILE_TYPES: string[] = [
  ...ACCEPTED_IMAGE_FILE_TYPES,
  ...ACCEPTED_VIDEO_FILE_TYPES,
];

export const MAX_MEDIA_UPLOAD_SIZE_IN_BYTES = 50_000_000;

// Core EXIF data
export interface MediaExif {
  aspectRatio: number
  make?: string
  model?: string
  focalLength?: number
  focalLengthIn35MmFormat?: number
  lensMake?: string
  lensModel?: string
  fNumber?: number
  iso?: number
  exposureTime?: number
  exposureCompensation?: number
  latitude?: number
  longitude?: number
  film?: string
  recipeData?: string
  takenAt?: string
  takenAtNaive?: string
  // Media meta potentially located in EXIF/XMP data
  title?: string
  caption?: string
  tags?: string[]
}

// Raw db insert
export interface MediaDbInsert extends MediaExif {
  id: string
  url: string
  extension: string
  mediaType: MediaType
  categories?: string[]
  studio?: string
  performers?: string[]
  contentType?: string[]
  rating?: number
  watched?: boolean
  durationSeconds?: number
  frameRate?: number
  mediaWidth?: number
  mediaHeight?: number
  posterUrl?: string
  previewUrl?: string
  transcodeStatus?: TranscodeStatus
  transcodeError?: string
  blurData?: string
  caption?: string
  semanticDescription?: string
  tags?: string[]
  recipeTitle?: string
  locationName?: string
  colorData?: string
  colorSort?: number
  priorityOrder?: number
  excludeFromFeeds?: boolean
  hidden?: boolean
  takenAt: string
  takenAtNaive: string
}

// Raw db response
export interface MediaDb extends
  Omit<MediaDbInsert,
    'takenAt' | 'tags' | 'performers' | 'contentType' | 'categories'> {
  updatedAt: Date
  createdAt: Date
  takenAt: Date
  hlsManifestUrl?: string
  hlsVerifiedAt?: Date
  categories: string[] | null
  tags: string[] | null
  performers: string[] | null
  contentType: string[] | null
}

// Parsed db response
export interface Media extends Omit<MediaDb, 'recipeData' | 'colorData'> {
  mediaType: MediaType
  categories: string[]
  studio?: string
  performers: string[]
  contentType: string[]
  watched?: boolean
  durationSeconds?: number
  frameRate?: number
  mediaWidth?: number
  mediaHeight?: number
  posterUrl?: string
  previewUrl?: string
  hlsManifestUrl?: string
  hlsVerifiedAt?: Date
  transcodeStatus?: TranscodeStatus
  transcodeError?: string
  focalLengthFormatted?: string
  focalLengthIn35MmFormatFormatted?: string
  fNumberFormatted?: string
  isoFormatted?: string
  exposureTimeFormatted?: string
  exposureCompensationFormatted?: string
  takenAtNaiveFormatted: string
  tags: string[]
  recipeData?: FujifilmRecipe
  colorData?: MediaColorData
  updateStatus?: MediaUpdateStatus
  missingStorageError?: string
}

const parseJsonSafely = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') {
    return (value ?? fallback) as T;
  }

  const trimmed = value.trim();
  if (!trimmed) { return fallback; }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    console.warn('Invalid JSON value ignored', error);
    return fallback;
  }
};

export const normalizeStoredArray = (value?: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeStoredText(
        typeof item === 'string' ? item : String(item),
      ))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) { return []; }

  // Postgres arrays may occasionally surface as "{a,b}" strings.
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(item => item.replace(/^"(.*)"$/, '$1').trim())
      .map(item => normalizeStoredText(item))
      .filter((item): item is string => Boolean(item));
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => normalizeStoredText(
          typeof item === 'string' ? item : String(item),
        ))
        .filter((item): item is string => Boolean(item));
    }
  } catch {}

  return trimmed
    .split(',')
    .map(item => normalizeStoredText(item))
    .filter((item): item is string => Boolean(item));
};

export const parseMediaFromDb = (photoDbRaw: MediaDb): Media => {
  const photoDb = camelcaseKeys(
    photoDbRaw as unknown as Record<string, unknown>,
  ) as unknown as MediaDb;
  const mediaType = (photoDb.mediaType ?? 'photo') as MediaType;
  const durationSeconds = photoDb.durationSeconds != null
    ? Number(photoDb.durationSeconds)
    : undefined;
  const frameRate = photoDb.frameRate != null
    ? Number(photoDb.frameRate)
    : undefined;
  const mediaWidth = photoDb.mediaWidth != null
    ? Number(photoDb.mediaWidth)
    : undefined;
  const mediaHeight = photoDb.mediaHeight != null
    ? Number(photoDb.mediaHeight)
    : undefined;
  const transcodeStatus = photoDb.transcodeStatus &&
    TRANSCODE_STATUSES.includes(photoDb.transcodeStatus as any)
    ? photoDb.transcodeStatus as TranscodeStatus
    : undefined;
  return {
    ...photoDb,
    mediaType,
    categories: normalizeStoredArray(photoDb.categories),
    studio: normalizeStoredText(photoDb.studio),
    performers: normalizeStoredArray(photoDb.performers),
    contentType: normalizeStoredArray(photoDb.contentType),
    watched: Boolean(photoDb.watched),
    durationSeconds,
    frameRate,
    mediaWidth,
    mediaHeight,
    transcodeStatus,
    title: normalizeStoredText(photoDb.title),
    tags: normalizeStoredArray(photoDb.tags),
    focalLengthFormatted:
      photoDb.focalLength
        ? formatFocalLength(photoDb.focalLength)
        : undefined,
    focalLengthIn35MmFormatFormatted:
      photoDb.focalLengthIn35MmFormat
        ? formatFocalLength(photoDb.focalLengthIn35MmFormat)
        : undefined,
    fNumberFormatted:
      formatAperture(photoDb.fNumber),
    isoFormatted:
      formatIso(photoDb.iso),
    exposureTimeFormatted:
      formatExposureTime(photoDb.exposureTime),
    exposureCompensationFormatted:
      formatExposureCompensation(photoDb.exposureCompensation),
    takenAtNaiveFormatted:
      formatDateFromPostgresString(photoDb.takenAtNaive),
    recipeData: photoDb.recipeData
      // Legacy check on escaped, string-based JSON
      ? typeof photoDb.recipeData === 'string'
        ? parseJsonSafely<FujifilmRecipe | undefined>(
          photoDb.recipeData,
          undefined,
        )
        : photoDb.recipeData
      : undefined,
    colorData: photoDb.colorData
      ? photoDb.colorData
      : undefined,
    updateStatus: generateMediaUpdateStatus(photoDb),
  } as Media;
};

export const parseCachedMediaDates = (photo: Media) => ({
  ...photo,
  takenAt: new Date(photo.takenAt),
  updatedAt: new Date(photo.updatedAt),
  createdAt: new Date(photo.createdAt),
} as Media);

export const parseCachedMediaItemsDates = (photos: Media[]) =>
  photos.map(parseCachedMediaDates);

export const convertMediaToMediaDbInsert = (
  photo: Media,
): MediaDbInsert => ({
  ...photo,
  title: normalizeStoredText(photo.title),
  categories: normalizeStoredArray(photo.categories),
  studio: normalizeStoredText(photo.studio),
  performers: normalizeStoredArray(photo.performers),
  contentType: normalizeStoredArray(photo.contentType),
  takenAt: photo.takenAt.toISOString(),
  recipeData: JSON.stringify(photo.recipeData),
  colorData: JSON.stringify(photo.colorData),
});

export const descriptionForMedia = (
  photo: Media,
  includeSemanticDescription?: boolean,
) =>
  photo.caption ||
  (includeSemanticDescription && photo.semanticDescription) ||
  formatDate({ date: photo.takenAt }).toLocaleUpperCase();

const getNormalizedMediaSequence = (photos: Media[]) => {
  const seen = new Set<string>();
  return photos.filter(item => {
    const key = [
      item.id,
      normalizeMediaUrlForMatching(item.url) ?? item.url,
    ].join('::');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const getMediaIndex = (photo: Media, photos: Media[]) => {
  const normalizedPhotos = getNormalizedMediaSequence(photos);
  const exactIdMatches = normalizedPhotos
    .map((item, index) => item.id === photo.id ? index : -1)
    .filter(index => index >= 0);

  if (exactIdMatches.length === 1) {
    return {
      index: exactIdMatches[0],
      normalizedPhotos,
    };
  }

  const normalizedUrl = normalizeMediaUrlForMatching(photo.url);
  if (normalizedUrl) {
    const urlMatches = normalizedPhotos
      .map((item, index) =>
        normalizeMediaUrlForMatching(item.url) === normalizedUrl ? index : -1)
      .filter(index => index >= 0);
    if (urlMatches.length > 0) {
      return {
        index: urlMatches[urlMatches.length - 1],
        normalizedPhotos,
      };
    }
  }

  return {
    index: exactIdMatches.length > 0
      ? exactIdMatches[exactIdMatches.length - 1]
      : -1,
    normalizedPhotos,
  };
};

export const getPreviousMedia = (photo: Media, photos: Media[]) => {
  const {
    index,
    normalizedPhotos,
  } = getMediaIndex(photo, photos);
  return index > 0
    ? normalizedPhotos[index - 1]
    : undefined;
};

export const getNextMedia = (photo: Media, photos: Media[]) => {
  const {
    index,
    normalizedPhotos,
  } = getMediaIndex(photo, photos);
  return index >= 0 && index < normalizedPhotos.length - 1
    ? normalizedPhotos[index + 1]
    : undefined;
};

export const generateOgImageMetaForMedia = (photos: Media[]): Metadata => {
  if (photos.length > 0) {
    return {
      openGraph: {
        images: ABSOLUTE_PATH_HOME_IMAGE,
      },
      twitter: {
        card: 'summary_large_image',
        images: ABSOLUTE_PATH_HOME_IMAGE,
      },
    };
  } else {
    // If there are no photos, refrain from showing an OG image
    return {};
  }
};

const MEDIA_ID_FORWARDING_TABLE = parseJsonSafely<Record<string, string>>(
  process.env.MEDIA_ID_FORWARDING_TABLE,
  {},
);

export const translateMediaId = (id: string) =>
  MEDIA_ID_FORWARDING_TABLE[id] || id;

export const titleForMedia = (
  photo: Media,
  useDateAsTitle = true,
  fallback = 'Untitled',
) => {
  if (photo.title) {
    return photo.title;
  } else if (useDateAsTitle && (photo.takenAt || photo.createdAt)) {
    return formatDate({
      date: photo.takenAt || photo.createdAt,
      length: 'tiny',
    }).toLocaleUpperCase();
  } else {
    return fallback;
  }
};

export const altTextForMedia = (photo: Media) =>
  photo.semanticDescription || titleForMedia(photo);

export const photoLabelForCount = (
  count: number,
  appText: AppTextState,
  _capitalize = true,
) => {
  const label = count === 1
    ? appText.photo.photo
    : appText.photo.photoPlural;
  return _capitalize
    ? capitalize(label)
    : label.toLocaleLowerCase();
};

export const photoQuantityText = (
  count: number,
  appText: AppTextState,
  includeParentheses = true,
  capitalize?: boolean,
) =>
  includeParentheses
    ? `(${count} ${photoLabelForCount(count, appText, capitalize)})`
    : `${count} ${photoLabelForCount(count, appText, capitalize)}`;  

export const deleteConfirmationTextForMedia = (
  photo: Media,
  appText: AppTextState,
) =>
  appText.admin.deleteConfirm(titleForMedia(photo));

export type MediaDateRangePostgres = { start: string, end: string };
export type MediaDateRangeFormatted = {
  start: string,
  end: string,
  description: string,
  descriptionWithSpaces: string,
};

export const descriptionForMediaSet = (
  photos:Media[] = [],
  appText: AppTextState,
  descriptor?: string,
  dateBased?: boolean,
  explicitCount?: number,
  explicitDateRange?: MediaDateRangePostgres,
) =>
  dateBased
    ? formattedDateRangeForMedia(photos, explicitDateRange)
      .description
      .toLocaleUpperCase()
    : [
      explicitCount ?? photos.length, (
        descriptor ||
        photoLabelForCount(explicitCount ?? photos.length, appText, false)
      ),
    ].join(' ');

const sortMediaByDateNonDestructively = (
  photos: Media[],
  order: 'ASC' | 'DESC' = 'DESC',
) =>
  [...photos].sort((a, b) => order === 'DESC'
    ? b.takenAt.getTime() - a.takenAt.getTime()
    : a.takenAt.getTime() - b.takenAt.getTime());

export const formattedDateRangeForMedia = (
  photos: Media[] = [],
  explicitDateRange?: MediaDateRangePostgres,
): MediaDateRangeFormatted => {
  let start = '';
  let end = '';
  let description = '';
  let descriptionWithSpaces = '';

  if (explicitDateRange || photos.length > 0) {
    const photosSorted = sortMediaByDateNonDestructively(photos);
    start = formatDateFromPostgresString(
      explicitDateRange?.start ?? photosSorted[photos.length - 1].takenAtNaive,
      'short',
    );
    end = formatDateFromPostgresString(
      explicitDateRange?.end ?? photosSorted[0].takenAtNaive,
      'short',
    );
    description = start === end
      ? start
      : `${start}–${end}`;
    descriptionWithSpaces = start === end
      ? start
      : `${start} – ${end}`;
  }

  return { start, end, description, descriptionWithSpaces };
};

const photoHasCameraData = (photo: Media) =>
  Boolean(photo.make) &&
  Boolean(photo.model);

const photoHasLensData = (photo: Media) =>
  Boolean(photo.lensModel);

const photoHasRecipeData = (photo: Media) =>
  Boolean(photo.recipeData);

const photoHasExifData = (photo: Media) =>
  Boolean(photo.focalLength) ||
  Boolean(photo.focalLengthIn35MmFormat) ||
  Boolean(photo.fNumberFormatted) ||
  Boolean(photo.isoFormatted) ||
  Boolean(photo.exposureTimeFormatted) ||
  Boolean(photo.exposureCompensationFormatted);

export const shouldShowCameraDataForMedia = (photo: Media) =>
  SHOW_EXIF_DATA &&
  photoHasCameraData(photo);

export const shouldShowLensDataForMedia = (photo: Media) =>
  SHOW_EXIF_DATA &&
  SHOW_LENSES &&
  photoHasLensData(photo);

export const shouldShowRecipeDataForMedia = (photo: Media) =>
  SHOW_EXIF_DATA &&
  SHOW_RECIPES &&
  photoHasRecipeData(photo);

export const shouldShowFilmDataForMedia = (photo: Media) =>
  SHOW_EXIF_DATA &&
  SHOW_FILMS &&
  photoHasFilmData(photo);

export const shouldShowExifDataForMedia = (photo: Media) =>
  SHOW_EXIF_DATA && photoHasExifData(photo);

export const getKeywordsForMedia = (photo: Media) =>
  [
    photo.id,
    photo.url,
    photo.title,
    photo.caption,
    photo.semanticDescription,
    photo.make,
    photo.model,
    photo.lensMake,
    photo.lensModel,
    photo.film,
    photo.recipeTitle,
    photo.locationName,
    photo.extension,
    photo.mediaType,
    photo.takenAtNaiveFormatted,
  ]
    .flatMap(value => (value ?? '').split(/[\/\s?&=,_{}[\]-]+/))
    .concat(photo.tags)
    .concat(photo.categories)
    .concat((photo.studio ?? '').split(' '))
    .concat(photo.contentType)
    .concat(photo.performers)
    .concat([
      photo.focalLengthFormatted,
      photo.focalLengthIn35MmFormatFormatted,
      photo.isoFormatted,
      photo.exposureTimeFormatted,
      photo.exposureCompensationFormatted,
    ].filter(Boolean) as string[])
    .filter(Boolean)
    .map(keyword => keyword.toLocaleLowerCase());

export const downloadFileNameForMedia = (photo: Media) =>
  photo.title
    ? `${parameterize(photo.title)}.${photo.extension}`
    : photo.url.split('/').pop() || 'download';

export const isMediaMedia = (photo: Media) => photo.mediaType === 'photo';

export const isVideoMedia = (photo: Media) => photo.mediaType === 'video';

export const getMediaPosterUrl = (photo: Media): string | undefined =>
  isVideoMedia(photo)
    ? photo.posterUrl
    : undefined;

export const getMediaPreviewUrl = (photo: Media): string | undefined =>
  isVideoMedia(photo)
    ? photo.previewUrl
    : undefined;

export const getMediaPlaybackUrl = (photo: Media): string | undefined =>
  isVideoMedia(photo)
    ? photo.previewUrl || photo.url
    : undefined;

export const getMediaThumbnailUrl = (photo: Media): string =>
  isVideoMedia(photo)
    ? getMediaPosterUrl(photo) ?? photo.url
    : photo.url;

export const getMediaAspectRatio = (photo: Media) =>
  photo.mediaType === 'video' && photo.mediaWidth && photo.mediaHeight
    ? photo.mediaWidth / photo.mediaHeight
    : photo.mediaType === 'video'
      ? photo.aspectRatio || 16 / 9
      : photo.aspectRatio || DEFAULT_ASPECT_RATIO;

export const hasResolvedVideoProcessing = (photo: Media) =>
  isVideoMedia(photo) &&
  Boolean(photo.posterUrl) &&
  Boolean(photo.previewUrl);

export const doesMediaNeedBlurCompatibility = (photo: Media) =>
  isBefore(photo.updatedAt, new Date('2024-05-07'));
