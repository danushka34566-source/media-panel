import { generateOgImageMetaForMedia } from '@/media';
import MediaEmptyState from '@/media/MediaEmptyState';
import { Metadata } from 'next/types';
import { cache } from 'react';
import MediaFullPage from '@/media/MediaFullPage';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { USER_DEFAULT_SORT_OPTIONS } from '@/app/config';
import { FEED_META_QUERY_OPTIONS, getFeedQueryOptions } from '@/feed';

export const maxDuration = 60;

const getFeedMediaCached = cache(() => getMediaCached(getFeedQueryOptions({
  isGrid: false,
})));

export async function generateMetadata(): Promise<Metadata> {
  const photos = await getFeedMediaCached()
    .catch(() => []);
  return generateOgImageMetaForMedia(photos);
}

export default async function FullPage() {
  const [
    photos,
    photosCount,
  ] = await Promise.all([
    getFeedMediaCached()
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
        ...USER_DEFAULT_SORT_OPTIONS,
      }} />
      : <MediaEmptyState />
  );
}
