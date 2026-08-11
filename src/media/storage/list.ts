import {
  getFileNamePartsFromStorageUrl,
  getCurrentStorageUrlsForPrefix,
} from '@/platforms/storage';
import { getMedia } from '@/media/query';
import type { Media } from '..';
import { isVirtualStorageVideoId } from './virtual';

const MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'mp4',
  'mov',
  'webm',
  'mkv',
  'm4v',
  'avi',
  'ts',
  'm2ts',
  'mts',
  'mpg',
  'mpeg',
  'wmv',
  'flv',
  '3gp',
  'ogv',
]);
const GENERATED_MEDIA_SUFFIX_REGEX =
  /-(sm|md|lg|poster|preview|stream|subtitles(?:\.[a-z0-9_-]+)?)$/i;
const UPLOAD_DETECTION_LIMIT = 1000;

const isStorageItemPendingMediaUpload = (
  item: Awaited<ReturnType<typeof getCurrentStorageUrlsForPrefix>>[number],
  knownStorageUrls: Set<string>,
  knownFileNameBases: Set<string>,
) => {
  const {
    fileExtension,
    fileNameBase,
  } = getFileNamePartsFromStorageUrl(item.url);
  const extension = fileExtension.toLowerCase();

  if (!MEDIA_EXTENSIONS.has(extension)) { return false; }
  if (knownStorageUrls.has(item.url)) { return false; }
  if (GENERATED_MEDIA_SUFFIX_REGEX.test(fileNameBase)) { return false; }

  const isKnownDerivative = Array.from(knownFileNameBases)
    .some(base => fileNameBase === base || fileNameBase.startsWith(`${base}-`));

  return !isKnownDerivative;
};

export const getStorageUploadUrls = async () => {
  const [
    allStorageUrls,
    photos,
  ] = await Promise.all([
    getCurrentStorageUrlsForPrefix('', UPLOAD_DETECTION_LIMIT),
    getMedia({ hidden: 'include' }).catch(() => [] as Media[]),
  ]);

  const knownStorageUrls = new Set<string>();
  const knownFileNameBases = new Set<string>();
  for (const photo of photos) {
    if (isVirtualStorageVideoId(photo.id)) {
      continue;
    }
    [
      photo.url,
      photo.posterUrl,
      photo.previewUrl,
    ].filter(Boolean).forEach(url => knownStorageUrls.add(url as string));
    if (photo.transcodeStatus === 'failed') {
      continue;
    }
    const { fileNameBase } = getFileNamePartsFromStorageUrl(photo.url);
    if (fileNameBase) {
      knownFileNameBases.add(fileNameBase);
    }
  }

  const pendingByUrl = new Map<string, (typeof allStorageUrls)[number]>();
  for (const item of allStorageUrls) {
    if (isStorageItemPendingMediaUpload(
      item,
      knownStorageUrls,
      knownFileNameBases,
    )) {
      pendingByUrl.set(item.url, item);
    }
  }

  return Array.from(pendingByUrl.values())
    .sort((a, b) => {
      if (!a.uploadedAt) { return 1; }
      if (!b.uploadedAt) { return -1; }
      return b.uploadedAt.getTime() - a.uploadedAt.getTime();
    });
};

export const getStorageMediaUrls = () =>
  getCurrentStorageUrlsForPrefix('');
