import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaFullPage from '@/media/MediaFullPage';
import { getMediaPageCached } from '@/media/cache';
import type { SortBy, SortProps } from '@/media/sort';
import { getSortOptionsFromParams } from '@/media/sort/path';
import { getFeedQueryOptions } from '@/feed';

export const maxDuration = 60;

const getMediaPage = cache((sortBy: SortBy, sortWithPriority: boolean) =>
  getMediaPageCached(getFeedQueryOptions({ isGrid: false, sortBy, sortWithPriority })));

export async function generateMetadata({
  params,
}: SortProps): Promise<Metadata> {
  const { sortBy, sortWithPriority } = await getSortOptionsFromParams(params);
  const { photos } = await getMediaPage(sortBy, sortWithPriority)
    .catch(() => ({ photos: [], hasMore: false }));
  return generateOgImageMetaForMedia(photos);
}

export default async function FullPageSort({ params }: SortProps) {
  const sortOptions = await getSortOptionsFromParams(params);
  const { photos, hasMore } = await getMediaPage(
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
