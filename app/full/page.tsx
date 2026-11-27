import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaFullPage from '@/media/MediaFullPage';
import { getMediaPageCached } from '@/media/cache';
import { getFeedQueryOptions } from '@/feed';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import type { SortBy } from '@/media/sort';
import { getPathForSortBy } from '@/media/sort/path';
import { USER_DEFAULT_SORT_BY } from '@/app/config';
import { redirect } from 'next/navigation';

export const maxDuration = 60;

const getFeedMediaCached = cache((sortBy: SortBy, sortWithPriority: boolean) =>
  getMediaPageCached(getFeedQueryOptions({ isGrid: false, sortBy, sortWithPriority })));
const getEffectiveMediaSortOptionsCached = cache(getEffectiveMediaSortOptions);

export async function generateMetadata(): Promise<Metadata> {
  const { sortBy, sortWithPriority } = await getEffectiveMediaSortOptionsCached();
  const { photos } = await getFeedMediaCached(sortBy, sortWithPriority)
    .catch(() => ({ photos: [], hasMore: false }));
  return generateOgImageMetaForMedia(photos);
}

export default async function FullPage({ searchParams }: PageProps<'/full'>) {
  const sortOptions = await getEffectiveMediaSortOptionsCached();
  if (sortOptions.sortBy !== USER_DEFAULT_SORT_BY) {
    redirect(getPathForSortBy('/full', sortOptions.sortBy, await searchParams));
  }
  const { photos, hasMore } = await getFeedMediaCached(
    sortOptions.sortBy,
    sortOptions.sortWithPriority,
  );

  return (
    photos.length > 0
      ? <MediaFullPage {...{
        photos,
        photosCount: hasMore ? photos.length + 1 : photos.length,
        initialHasMore: hasMore,
        ...sortOptions,
      }} />
      : <MediaEmptyState />
  );
}
