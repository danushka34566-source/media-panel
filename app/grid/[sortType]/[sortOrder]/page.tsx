import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { getMedia } from '@/media/query';
import { cache } from 'react';
import MediaGridPage from '@/media/MediaGridPage';
import { getDataForCategoriesCached } from '@/category/cache';
import { getMediaMetaCached } from '@/media/cache';
import { SortProps } from '@/media/sort';
import { getSortOptionsFromParams } from '@/media/sort/path';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';
import { MediaQueryOptions } from '@/db';

export const maxDuration = 60;

const getMediaCached = cache((options: MediaQueryOptions) =>
  getMedia(getFeedQueryOptions({
    isGrid: true,
    ...options,
  })));

export async function generateMetadata({
  params,
}: SortProps): Promise<Metadata> {
  const sortOptions = await getSortOptionsFromParams(params);
  const photos = await getMediaCached(sortOptions)
    .catch(() => []);
  return generateOgImageMetaForMedia(photos);
}

export default async function GridPage({ params }: SortProps) {
  const sortOptions = await getSortOptionsFromParams(params);
  const [
    photos,
    photosCount,
    photosCountWithExcludes,
    categories,
  ] = await Promise.all([
    getMediaCached(sortOptions)
      .catch(() => []),
    getMediaMetaCached(FEED_META_QUERY_OPTIONS)
      .then(({ count }) => count)
      .catch(() => 0),
    getMediaMetaCached()
      .then(({ count }) => count)
      .catch(() => 0),
    getDataForCategoriesCached(),
  ]);

  return (
    photos.length > 0
      ? <MediaGridPage
        {...{
          photos,
          photosCount,
          photosCountWithExcludes,
          ...sortOptions,
          ...categories,
        }}
      />
      : <MediaEmptyState />
  );
}
