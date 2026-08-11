import { Media, MediaDbInsert } from '..';
import { getFileNamePartsFromStorageUrl } from '@/platforms/storage';
import { doesMediaUrlHaveOptimizedFiles } from '../storage';

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'mov', 'm4v', 'webm', 'avi', 'ts', 'm2ts', 'mts',
  'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ogv',
]);

const resolveExtension = (photo: Media | MediaDbInsert) => {
  const { fileExtension } = getFileNamePartsFromStorageUrl(photo.url);
  const normalizedFromUrl = fileExtension?.toLowerCase();
  const normalizedFromMedia = typeof photo.extension === 'string'
    ? photo.extension.toLowerCase()
    : undefined;
  return normalizedFromUrl ?? normalizedFromMedia;
};

// Used to anonymize storage/create optimized files if necessary
// by re-running convertUploadToMedia (image upload transfer logic)
export const shouldBackfillMediaStorage = async (
  photo: Media | MediaDbInsert,
) => {
  const extension = resolveExtension(photo);
  const isVideo = photo.mediaType === 'video' ||
    (extension ? VIDEO_EXTENSIONS.has(extension) : false);

  if (isVideo && !photo.posterUrl) {
    return true;
  }
  if (isVideo && (!photo.previewUrl || photo.transcodeStatus !== 'ready')) {
    return true;
  }
  if (isVideo && photo.mediaType !== 'video') {
    return true;
  }
  if (
    isVideo &&
    (
      photo.durationSeconds == null ||
      photo.mediaWidth == null ||
      photo.mediaHeight == null
    )
  ) {
    return true;
  }

  return !await doesMediaUrlHaveOptimizedFiles(
    photo.url,
    isVideo ? 'video' : photo.mediaType,
  );
};
