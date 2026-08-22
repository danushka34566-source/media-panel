import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaFullPage from '@/media/MediaFullPage';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';

export const maxDuration = 60;

const getFeedMediaCached = cache((sortOptions: ReturnType<typeof getFeedQueryOptions>) =>
  getMediaCached(sortOptions));

export async function generateMetadata(): Promise<Metadata> {
  const sortOptions = await getEffectiveMediaSortOptions();
  const photos = await getFeedMediaCached(getFeedQueryOptions({
    isGrid: false,
    ...sortOptions,
  }))
    .catch(() => []);
  return generateOgImageMetaForMedia(photos);
}

export default async function FullPage() {
  const sortOptions = await getEffectiveMediaSortOptions();
  const [
    photos,
    photosCount,
  ] = await Promise.all([
    getFeedMediaCached(getFeedQueryOptions({
      isGrid: false,
      ...sortOptions,
    }))
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
