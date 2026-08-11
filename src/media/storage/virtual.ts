import { Media } from '@/media';
import {
  getFileNamePartsFromStorageUrl,
  getCurrentStorageUrlsForPrefix,
  StorageListItem,
} from '@/platforms/storage';
import { formatDateFromPostgresString } from '@/utility/date';
import { createHash } from 'crypto';

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'mov', 'm4v', 'webm', 'avi', 'ts', 'm2ts', 'mts',
  'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ogv',
]);
const GENERATED_VIDEO_SUFFIX_REGEX =
  /-(poster|preview|stream|subtitles(?:\.[a-z0-9_-]+)?)$/i;
const VIRTUAL_VIDEO_ID_PREFIX = 'v';

const isMainStorageVideo = ({ url }: StorageListItem) => {
  const {
    fileExtension,
    fileNameBase,
  } = getFileNamePartsFromStorageUrl(url);
  return (
    VIDEO_EXTENSIONS.has(fileExtension.toLowerCase()) &&
    !GENERATED_VIDEO_SUFFIX_REGEX.test(fileNameBase)
  );
};

const deriveTitleFromFileName = (fileName: string) =>
  fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const virtualVideoIdForUrl = (url: string) =>
  `${VIRTUAL_VIDEO_ID_PREFIX}${createHash('sha1')
    .update(url)
    .digest('hex')
    .slice(0, 7)}`;

export const isVirtualStorageVideoId = (id: string) =>
  new RegExp(`^${VIRTUAL_VIDEO_ID_PREFIX}[a-f0-9]{7}$`).test(id);

const getNaivePostgresDate = (date: Date) =>
  date.toISOString().replace(
    /(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(.[\d]+Z)*/,
    '$1 $2',
  );

const storageItemToVirtualMedia = (item: StorageListItem): Media => {
  const {
    fileName,
    fileExtension,
  } = getFileNamePartsFromStorageUrl(item.url);
  const date = item.uploadedAt ?? new Date();
  const takenAtNaive = getNaivePostgresDate(date);

  return {
    id: virtualVideoIdForUrl(item.url),
    url: item.url,
    extension: fileExtension,
    mediaType: 'video',
    aspectRatio: 16 / 9,
    title: deriveTitleFromFileName(fileName),
    categories: [],
    contentType: [],
    performers: [],
    tags: [],
    takenAt: date,
    takenAtNaive,
    takenAtNaiveFormatted: formatDateFromPostgresString(takenAtNaive),
    createdAt: date,
    updatedAt: date,
    excludeFromFeeds: false,
    hidden: false,
  } as Media;
};

export const getVirtualStorageVideoMediaItems = async () =>
  getCurrentStorageUrlsForPrefix('')
    .then(items => items
      .filter(isMainStorageVideo)
      .map(storageItemToVirtualMedia));

export const getVirtualStorageVideoMedia = async (id: string) =>
  isVirtualStorageVideoId(id)
    ? getVirtualStorageVideoMediaItems()
      .then(photos => photos.find(photo => photo.id === id))
    : undefined;
