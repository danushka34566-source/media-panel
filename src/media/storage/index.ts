import {
  getNextImageUrlForRequest,
  NextImageSize,
} from '@/platforms/next-image';
import {
  generateMediaStorageId,
  getFileNamePartsFromStorageUrl,
  getCurrentStorageUrlsForPrefix,
  generateStorageId,
  sanitizeStorageFileNameBase,
  uploadFileFromClient,
} from '@/platforms/storage';
import type { OnUploadProgressCallback } from '@/platforms/storage/types';
import { MediaType, isVideoMedia, type Media } from '..';
import { buildStagedUploadKey } from './upload-key';

const PREFIX_POSTER = 'poster';
const PREFIX_PREVIEW = 'preview';

const EXTENSION_DEFAULT = 'jpg';
const EXTENSION_OPTIMIZED = 'jpg';

// For the time being, make compatible with `next/image` sizes
const OPTIMIZED_FILE_SIZES = [{
  suffix: 'sm',
  size: 200,
  quality: 90,
}, {
  suffix: 'md',
  size: 640,
  quality: 90,
}, {
  suffix: 'lg',
  size: 1080,
  quality: 80,
}] as const satisfies {
  suffix: string
  size: NextImageSize
  quality: number
}[];

type OptimizedSuffix = (typeof OPTIMIZED_FILE_SIZES)[number]['suffix'];

const OPTIMIZED_SUFFIX_DEFAULT: OptimizedSuffix = 'md';

const getOptimizedFileName = ({
  fileNameBase,
  suffix,
}: {
  fileNameBase: string
  suffix: OptimizedSuffix
}) =>
  `${fileNameBase}-${suffix}.${EXTENSION_OPTIMIZED}`;

const getOptimizedUrl =({
  urlBase,
  fileNameBase,
  suffix,
}: {
  urlBase: string
  fileNameBase: string
  suffix: OptimizedSuffix
}) =>
  `${urlBase}/${getOptimizedFileName({ fileNameBase, suffix })}`;

export const getOptimizedMediaFileMeta = (fileNameBase: string) =>
  OPTIMIZED_FILE_SIZES.map(({ suffix, ...rest }) => ({
    ...rest,
    fileName: getOptimizedFileName({ fileNameBase, suffix }),
  }));

export const getOptimizedUrlsFromMediaUrl = (url: string) => {
  const { urlBase, fileNameBase } = getFileNamePartsFromStorageUrl(url);
  return getOptimizedMediaFileMeta(fileNameBase).map(({ fileName }) =>
    `${urlBase}/${fileName}`);
};

export const isUploadPathnameValid = (pathname?: string) =>
  pathname?.match(/^[a-z0-9][a-z0-9._@-]*\.[a-z0-9]{1,8}$/i);

const normalizeUploadExtension = (value?: string) => {
  const normalized = value?.trim().replace(/^\.+/, '').toLowerCase();
  return normalized?.match(/^[a-z0-9]{1,8}$/)
    ? normalized
    : undefined;
};

const normalizeUploadBase = (value?: string, fallback?: string) => {
  const sanitized = sanitizeStorageFileNameBase(
    value,
    fallback,
    { preserveCase: true },
  );
  const normalized = sanitized
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9._@-]+/gi, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/[-._@]+$/g, '')
    .slice(0, 120);
  return normalized.match(/^[a-z0-9]/i)
    ? normalized
    : (fallback ?? generateMediaStorageId());
};

export const generateRandomFileNameForMedia = (_mediaType: MediaType) =>
  generateMediaStorageId();

export const generateRandomFileNameForImage = () =>
  generateRandomFileNameForMedia('photo');

export const generateRandomFileNameForVideo = () =>
  generateRandomFileNameForMedia('video');

export const getStorageMediaUrls = () =>
  getCurrentStorageUrlsForPrefix('');

export const uploadMediaFromClient = (
  file: File | Blob,
  {
    extension = EXTENSION_DEFAULT,
    mediaType = 'photo',
    originalFileName,
    abortSignal,
    onUploadProgress,
  }: {
    extension?: string
    mediaType?: MediaType
    originalFileName?: string
    abortSignal?: AbortSignal
    onUploadProgress?: OnUploadProgressCallback
  } = {},
) => {
  const generatedFallbackBase = generateMediaStorageId();
  const normalizedOriginalBase = normalizeUploadBase(
    originalFileName?.replace(/\.[^/.]+$/, ''),
    generatedFallbackBase,
  );
  const extensionFromOriginal = normalizeUploadExtension(
    originalFileName?.includes('.')
      ? originalFileName.split('.').pop()
      : undefined,
  );
  const normalizedExtension = normalizeUploadExtension(extension);
  const extensionToUse =
    normalizedExtension ||
    extensionFromOriginal ||
    (mediaType === 'photo' ? EXTENSION_DEFAULT : 'mp4');
  const uploadBase = isUploadPathnameValid(
    `${normalizedOriginalBase}.${extensionToUse}`,
  )
    ? normalizedOriginalBase
    : generatedFallbackBase;
  const stagedUploadKey = buildStagedUploadKey(
    `${uploadBase}.${extensionToUse}`,
    generateStorageId(),
  );
  return uploadFileFromClient(
    file,
    stagedUploadKey.replace(/\.[^/.]+$/, ''),
    extensionToUse,
    { addRandomSuffix: false, abortSignal, onUploadProgress },
  ).then(url => ({
    url,
    mediaType,
    extension: extensionToUse,
    originalFileName,
  }));
};

export const uploadImageFromClient = (
  file: File | Blob,
  extension = EXTENSION_DEFAULT,
) =>
  uploadMediaFromClient(file, { extension, mediaType: 'photo' })
    .then(({ url }) => url);

const getSuffixFromNextImageSize = (nextSize: NextImageSize) =>
  OPTIMIZED_FILE_SIZES.find(({ size }) => size === nextSize)?.suffix
    ?? OPTIMIZED_SUFFIX_DEFAULT;

export const getOptimizedMediaUrl = (
  args: Parameters<typeof getNextImageUrlForRequest>[0] & {
    compatibilityMode?: boolean
  },
) => {
  const { compatibilityMode = true } = args;
  const suffix = getSuffixFromNextImageSize(args.size);
  const {
    urlBase,
    fileNameBase,
  } = getFileNamePartsFromStorageUrl(args.imageUrl);
  return compatibilityMode
    ? getNextImageUrlForRequest(args)
    : getOptimizedUrl({ urlBase, fileNameBase, suffix });
};

// Generate small, low-bandwidth images for quick manipulations such as
// generating blur data or image thumbnails for AI text generation
export const getOptimizedMediaUrlForManipulation = (
  imageUrl: string,
  addBypassSecret: boolean,
  compatibilityMode?: boolean,
) =>
  getOptimizedMediaUrl({
    imageUrl,
    size: 640,
    addBypassSecret,
    compatibilityMode,
  });

const getTestOptimizedMediaUrl = (url: string) => {
  const { urlBase, fileNameBase } = getFileNamePartsFromStorageUrl(url);
  return getOptimizedUrl({
    urlBase,
    fileNameBase,
    suffix: 'sm',
  });
};

export const doesMediaUrlHaveOptimizedFiles = async (
  url: string,
  mediaType: MediaType = 'photo',
) => mediaType === 'video'
  ? true
  : fetch(getTestOptimizedMediaUrl(url)).then(res => res.ok);

export const doAllMediaHaveOptimizedFiles = async (photos: Media[]) =>
  Promise.all(photos
    .filter(photo => !isVideoMedia(photo))
    .map(({ url }) => fetch(getTestOptimizedMediaUrl(url))))
    .then(urls => urls.every(url => url.ok))
    .catch(() => false);

export const getStorageUrlsForMedia = async ({ url }: Media) => {
  const getSortScoreForUrl = (url: string) => {
    const {
      fileName,
      fileNameBase,
    } = getFileNamePartsFromStorageUrl(url);
    if (fileNameBase.endsWith('-sm')) { return 1; }
    if (fileNameBase.endsWith('-md')) { return 2; }
    if (fileNameBase.endsWith('-lg')) { return 3; }
    if (fileNameBase.endsWith(`-${PREFIX_POSTER}`)) { return 4; }
    if (fileNameBase.endsWith(`-${PREFIX_PREVIEW}`)) { return 5; }
    if (/-subtitles\.[a-z0-9_-]+\.vtt$/i.test(fileName)) { return 6; }
    if (/-subtitles\.vtt$/i.test(fileName)) { return 7; }
    if (/-subtitles\.json$/i.test(fileName)) { return 8; }
    return 0;
  };

  const { fileNameBase } = getFileNamePartsFromStorageUrl(url);

  return getCurrentStorageUrlsForPrefix(fileNameBase).then(urls =>
    urls.sort((a, b) => getSortScoreForUrl(a.url) - getSortScoreForUrl(b.url)),
  );
};
