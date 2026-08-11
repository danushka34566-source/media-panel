import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import { GRID_HOMEPAGE_ENABLED, USER_DEFAULT_SORT_OPTIONS } from '@/app/config';
import { NULL_CATEGORY_DATA } from '@/category/data';
import MediaFullPage from '@/media/MediaFullPage';
import MediaGridPage from '@/media/MediaGridPage';
import { getDataForCategoriesCached } from '@/category/cache';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';

export const maxDuration = 60;

const getFeedMediaCached = cache(() => getMediaCached(getFeedQueryOptions({
  isGrid: GRID_HOMEPAGE_ENABLED,
})));

export async function generateMetadata(): Promise<Metadata> {
  const photos = await getFeedMediaCached()
    .catch(() => []);
  return generateOgImageMetaForMedia(photos);
}

export default async function HomePage() {
  const [
    photos,
    photosCount,
    photosCountWithExcludes,
    categories,
  ] = await Promise.all([
    getFeedMediaCached()
      .catch(() => []),
    getMediaMetaCached(FEED_META_QUERY_OPTIONS)
      .then(({ count }) => count)
      .catch(() => 0),
    getMediaMetaCached()
      .then(({ count }) => count)
      .catch(() => 0),
    GRID_HOMEPAGE_ENABLED
      ? getDataForCategoriesCached()
      : NULL_CATEGORY_DATA,
  ]);

  return (
    photos.length > 0
      ? GRID_HOMEPAGE_ENABLED
        ? <MediaGridPage
          {...{
            photos,
            photosCount,
            photosCountWithExcludes,
            ...USER_DEFAULT_SORT_OPTIONS,
            ...categories,
          }}
        />
        : <MediaFullPage {...{
          photos,
          photosCount,
          ...USER_DEFAULT_SORT_OPTIONS,
        }} />
      : <MediaEmptyState />
  );
}
