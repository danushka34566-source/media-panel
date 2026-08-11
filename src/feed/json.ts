import { absolutePathForMedia } from '@/app/path';
import {
  FEED_MEDIA_WIDTH_LARGE,
  FEED_MEDIA_WIDTH_MEDIUM,
  FEED_MEDIA_WIDTH_SMALL,
  FeedMedia,
  generateFeedMedia,
  getCoreFeedFields,
} from './programmatic';
import { formatDateFromPostgresString } from '@/utility/date';
import { Media } from '@/media';
import { BASE_URL, META_DESCRIPTION, META_TITLE } from '@/app/config';

interface FeedMediaJson {
  id: string
  title: string
  url: string
  make?: string
  model?: string
  tags?: string[]
  takenAtNaive: string
  src: Record<'small' | 'medium' | 'large', FeedMedia>
}

const formatMediaForFeedJson = (photo: Media): FeedMediaJson => ({
  ...getCoreFeedFields(photo),
  url: absolutePathForMedia({ photo }),
  ...photo.make && { make: photo.make },
  ...photo.model && { model: photo.model },
  ...photo.tags.length > 0 && { tags: photo.tags },
  takenAtNaive: formatDateFromPostgresString(photo.takenAtNaive),
  src: {
    small: generateFeedMedia(photo, FEED_MEDIA_WIDTH_SMALL),
    medium: generateFeedMedia(photo, FEED_MEDIA_WIDTH_MEDIUM),
    large: generateFeedMedia(photo, FEED_MEDIA_WIDTH_LARGE),
  },
});

export const formatFeedJson = (photos: Media[]) => ({
  meta: {
    title: META_TITLE,
    url: BASE_URL,
    ...META_DESCRIPTION && { description: META_DESCRIPTION },
  },
  photos: photos.map(formatMediaForFeedJson),
});
