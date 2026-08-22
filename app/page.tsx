import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import {
  GRID_HOMEPAGE_ENABLED,
  USER_DEFAULT_SORT_BY,
} from '@/app/config';
import { NULL_CATEGORY_DATA } from '@/category/data';
import MediaFullPage from '@/media/MediaFullPage';
import MediaGridPage from '@/media/MediaGridPage';
import { getDataForCategoriesCached } from '@/category/cache';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import { getPathForSortBy } from '@/media/sort/path';
import { redirect } from 'next/navigation';

export const maxDuration = 60;

const getFeedMediaCached = cache((sortOptions: ReturnType<typeof getFeedQueryOptions>) =>
  getMediaCached(sortOptions));

export async function generateMetadata(): Promise<Metadata> {
  const sortOptions = await getEffectiveMediaSortOptions();
  const photos = await getFeedMediaCached(getFeedQueryOptions({
    isGrid: GRID_HOMEPAGE_ENABLED,
    ...sortOptions,
  }))
    .catch(() => []);
  return generateOgImageMetaForMedia(photos);
}

export default async function HomePage() {
  const sortOptions = await getEffectiveMediaSortOptions();
  if (sortOptions.sortBy !== USER_DEFAULT_SORT_BY) {
    redirect(getPathForSortBy('/', sortOptions.sortBy));
  }
  const [
    photos,
    photosCount,
    photosCountWithExcludes,
    categories,
  ] = await Promise.all([
    getFeedMediaCached(getFeedQueryOptions({
      isGrid: GRID_HOMEPAGE_ENABLED,
      ...sortOptions,
    }))
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
            ...sortOptions,
            ...categories,
          }}
        />
        : <MediaFullPage {...{
          photos,
          photosCount,
          ...sortOptions,
        }} />
      : <MediaEmptyState />
  );
}
