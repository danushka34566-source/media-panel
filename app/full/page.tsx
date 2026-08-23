import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaFullPage from '@/media/MediaFullPage';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import { getPathForSortBy } from '@/media/sort/path';
import { USER_DEFAULT_SORT_BY } from '@/app/config';
import { redirect } from 'next/navigation';

export const maxDuration = 60;

const getFeedMediaCached = cache((sortOptions: ReturnType<typeof getFeedQueryOptions>) =>
  getMediaCached(sortOptions));
const getEffectiveMediaSortOptionsCached = cache(getEffectiveMediaSortOptions);

export async function generateMetadata(): Promise<Metadata> {
  const sortOptions = await getEffectiveMediaSortOptionsCached();
  const photos = await getFeedMediaCached(getFeedQueryOptions({
    isGrid: false,
    ...sortOptions,
  }))
    .catch(() => []);
  return generateOgImageMetaForMedia(photos);
}

export default async function FullPage() {
  const sortOptions = await getEffectiveMediaSortOptionsCached();
  if (sortOptions.sortBy !== USER_DEFAULT_SORT_BY) {
    redirect(getPathForSortBy('/full', sortOptions.sortBy));
  }
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
