import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaGridPage from '@/media/MediaGridPage';
import { getDataForCategoriesCached } from '@/category/cache';
import { getMediaPageCached, getMediaMetaCached } from '@/media/cache';
import type { SortBy, SortProps } from '@/media/sort';
import { getSortOptionsFromParams } from '@/media/sort/path';
import { getFeedQueryOptions } from '@/feed';

export const maxDuration = 60;

const getMediaPage = cache((sortBy: SortBy, sortWithPriority: boolean) =>
  getMediaPageCached(getFeedQueryOptions({ isGrid: true, sortBy, sortWithPriority })));

export async function generateMetadata({
  params,
}: SortProps): Promise<Metadata> {
  const { sortBy, sortWithPriority } = await getSortOptionsFromParams(params);
  const { photos } = await getMediaPage(sortBy, sortWithPriority)
    .catch(() => ({ photos: [], hasMore: false }));
  return generateOgImageMetaForMedia(photos);
}

export default async function GridPage({ params }: SortProps) {
  const sortOptions = await getSortOptionsFromParams(params);
  const [
    { photos, hasMore },
    photosCountWithExcludes,
    categories,
  ] = await Promise.all([
    getMediaPage(sortOptions.sortBy, sortOptions.sortWithPriority),
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
