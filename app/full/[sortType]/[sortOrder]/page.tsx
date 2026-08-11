import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import { getMedia } from '@/media/query';
import MediaFullPage from '@/media/MediaFullPage';
import { getMediaMetaCached } from '@/media/cache';
import { SortProps } from '@/media/sort';
import { getSortOptionsFromParams } from '@/media/sort/path';
import { MediaQueryOptions } from '@/db';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';

export const maxDuration = 60;

const getMediaCached = cache((options: MediaQueryOptions) =>
  getMedia(getFeedQueryOptions({
    isGrid: false,
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

export default async function FullPageSort({ params }: SortProps) {
  const sortOptions = await getSortOptionsFromParams(params);
  const [
    photos,
    photosCount,
  ] = await Promise.all([
    getMediaCached(sortOptions)
      .catch(() => []),
    getMediaMetaCached(FEED_META_QUERY_OPTIONS)
      .then(({ count }) => count)
      .catch(() => 0),
  ]);

  return (
    photos.length > 0
      ? <MediaFullPage {...{
        photos,
        photosCount,
        ...sortOptions,
      }} />
      : <MediaEmptyState />
  );
}
