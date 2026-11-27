import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaGridPage from '@/media/MediaGridPage';
import { getDataForCategoriesCached } from '@/category/cache';
import { getMediaPageCached, getMediaMetaCached } from '@/media/cache';
import { getFeedQueryOptions } from '@/feed';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import type { SortBy } from '@/media/sort';
import { getPathForSortBy } from '@/media/sort/path';
import { USER_DEFAULT_SORT_BY } from '@/app/config';
import { redirect } from 'next/navigation';

export const maxDuration = 60;

const getFeedMediaCached = cache((sortBy: SortBy, sortWithPriority: boolean) =>
  getMediaPageCached(getFeedQueryOptions({ isGrid: true, sortBy, sortWithPriority })));
const getEffectiveMediaSortOptionsCached = cache(getEffectiveMediaSortOptions);

export async function generateMetadata(): Promise<Metadata> {
  const { sortBy, sortWithPriority } = await getEffectiveMediaSortOptionsCached();
  const { photos } = await getFeedMediaCached(sortBy, sortWithPriority)
    .catch(() => ({ photos: [], hasMore: false }));
  return generateOgImageMetaForMedia(photos);
}

export default async function GridPage({ searchParams }: PageProps<'/grid'>) {
  const sortOptions = await getEffectiveMediaSortOptionsCached();
  // Resolve the account preference before rendering any grid markup. The
  // client used to render the default URL first and redirect a few moments
  // later, causing a visible order flash and a second data load.
  if (sortOptions.sortBy !== USER_DEFAULT_SORT_BY) {
    redirect(getPathForSortBy('/grid', sortOptions.sortBy, await searchParams));
  }
  const [
    { photos, hasMore },
    photosCountWithExcludes,
    categories,
  ] = await Promise.all([
    getFeedMediaCached(sortOptions.sortBy, sortOptions.sortWithPriority),
    getMediaMetaCached()
      .then(({ count }) => count),
    getDataForCategoriesCached(),
  ]);

  return (
    photos.length > 0
      ? <MediaGridPage
        {...{
          photos,
          photosCount: hasMore ? photos.length + 1 : photos.length,
          photosCountWithExcludes,
          initialHasMore: hasMore,
          ...sortOptions,
          ...categories,
        }}
      />
      : <MediaEmptyState />
  );
}
