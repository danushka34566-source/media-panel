import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaGridPage from '@/media/MediaGridPage';
import { getDataForCategoriesCached } from '@/category/cache';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import { getPathForSortBy } from '@/media/sort/path';
import { USER_DEFAULT_SORT_BY } from '@/app/config';
import { redirect } from 'next/navigation';

export const maxDuration = 60;

const getFeedMediaCached = cache((sortOptions: ReturnType<typeof getFeedQueryOptions>) =>
  getMediaCached(sortOptions));

export async function generateMetadata(): Promise<Metadata> {
  const sortOptions = await getEffectiveMediaSortOptions();
  const photos = await getFeedMediaCached(getFeedQueryOptions({
    isGrid: true,
    ...sortOptions,
  }))
    .catch(() => []);
  return generateOgImageMetaForMedia(photos);
}

export default async function GridPage() {
  const sortOptions = await getEffectiveMediaSortOptions();
  // Resolve the account preference before rendering any grid markup. The
  // client used to render the default URL first and redirect a few moments
  // later, causing a visible order flash and a second data load.
  if (sortOptions.sortBy !== USER_DEFAULT_SORT_BY) {
    redirect(getPathForSortBy('/grid', sortOptions.sortBy));
  }
  const [
    photos,
    photosCount,
    photosCountWithExcludes,
    categories,
  ] = await Promise.all([
    getFeedMediaCached(getFeedQueryOptions({
      isGrid: true,
      ...sortOptions,
    }))
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
