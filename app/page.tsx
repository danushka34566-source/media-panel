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
import { getMediaPageCached, getMediaMetaCached } from '@/media/cache';
import { getFeedQueryOptions } from '@/feed';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import type { SortBy } from '@/media/sort';
import { getPathForSortBy } from '@/media/sort/path';
import { redirect } from 'next/navigation';

export const maxDuration = 60;

const getFeedPageCached = cache((sortBy: SortBy, sortWithPriority: boolean) =>
  getMediaPageCached(getFeedQueryOptions({
    isGrid: GRID_HOMEPAGE_ENABLED,
    sortBy,
    sortWithPriority,
  })));
const getEffectiveMediaSortOptionsCached = cache(getEffectiveMediaSortOptions);

export async function generateMetadata(): Promise<Metadata> {
  const { sortBy, sortWithPriority } = await getEffectiveMediaSortOptionsCached();
  const { photos } = await getFeedPageCached(sortBy, sortWithPriority)
    .catch(() => ({ photos: [], hasMore: false }));
  return generateOgImageMetaForMedia(photos);
}

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const sortOptions = await getEffectiveMediaSortOptionsCached();
  if (sortOptions.sortBy !== USER_DEFAULT_SORT_BY) {
    redirect(getPathForSortBy('/', sortOptions.sortBy, await searchParams));
  }
  const { photos, hasMore } = await getFeedPageCached(
    sortOptions.sortBy,
    sortOptions.sortWithPriority,
  );
  const [photosCountWithExcludes, categories] = GRID_HOMEPAGE_ENABLED
    ? await Promise.all([
      getMediaMetaCached().then(({ count }) => count),
      getDataForCategoriesCached(),
    ])
    : [0, NULL_CATEGORY_DATA];
  const photosCount = hasMore ? photos.length + 1 : photos.length;

  return (
    photos.length > 0
      ? GRID_HOMEPAGE_ENABLED
        ? <MediaGridPage
          {...{
            photos,
            photosCount,
            photosCountWithExcludes,
            initialHasMore: hasMore,
            ...sortOptions,
            ...categories,
          }}
        />
        : <MediaFullPage {...{
          photos,
          photosCount,
          initialHasMore: hasMore,
          ...sortOptions,
        }} />
      : <MediaEmptyState />
  );
}
