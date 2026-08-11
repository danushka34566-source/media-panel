import {
  descriptionForMedia,
  getMediaThumbnailUrl,
  Media,
  titleForMedia,
} from '@/media';
import { getOptimizedMediaUrl } from '@/media/storage';
import { NextImageSize } from '@/platforms/next-image';

export const FEED_MEDIA_REQUEST_LIMIT = 40;

export const FEED_MEDIA_WIDTH_SMALL = 200;
export const FEED_MEDIA_WIDTH_MEDIUM = 640;
export const FEED_MEDIA_WIDTH_LARGE = 1200;

export interface FeedMedia {
  url: string
  width: number
  height: number
}

export const generateFeedMedia = (
  photo: Media,
  size: NextImageSize,
): FeedMedia => ({
  url: getOptimizedMediaUrl({ imageUrl: getMediaThumbnailUrl(photo), size }),
  width: size,
  height: Math.round(size / photo.aspectRatio),
});

export const getCoreFeedFields = (photo: Media) => ({
  id: photo.id,
  title: titleForMedia(photo),
  description: descriptionForMedia(photo, true),
});
