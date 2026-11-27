import {
  RELATED_GRID_MEDIA_TO_SHOW,
  descriptionForMedia,
  titleForMedia,
  type Media,
} from '@/media';
import { Metadata } from 'next/types';
import { redirect } from 'next/navigation';
import {
  PATH_ROOT,
  absolutePathForMedia,
  absolutePathForMediaImage,
  getMediaSearchQuery,
} from '@/app/path';
import MediaDetailPage from '@/media/MediaDetailPage';
import { getMediaNearIdCached } from '@/media/cache';
import { getMedia } from '@/media/query';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import { SORT_BY_OPTIONS, type SortBy } from '@/media/sort';
import { cache } from 'react';

export const maxDuration = 60;
// Nearby cards and next/previous navigation depend on the signed-in account.
export const dynamic = 'force-dynamic';

const getEffectiveMediaSortOptionsCached = cache(getEffectiveMediaSortOptions);
const getPrimaryMedia = cache((photoId: string) => getMedia(photoId));
const resolveDetailNavigation = async (searchParams: MediaProps['searchParams']) => {
  const { sort, query } = await searchParams;
  const effectiveSortOptions = await getEffectiveMediaSortOptionsCached();
  return {
    sortBy: SORT_BY_OPTIONS.find(option => option.sortBy === sort)?.sortBy ??
      effectiveSortOptions.sortBy,
    sortWithPriority: effectiveSortOptions.sortWithPriority,
    query: getMediaSearchQuery(query),
  };
};

const getMediaNearIdCachedCached = cache((
  photoId: string,
  sortBy: SortBy,
  sortWithPriority: boolean,
  query: string | undefined,
) =>
  getMediaNearIdCached(
    photoId, {
      limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1,
      excludeFromFeeds: true,
      sortBy,
      sortWithPriority,
      query,
    },
  ));

const loadDetailNavigation = async (
  photoId: string,
  photo: Media,
  searchParams: MediaProps['searchParams'],
) => {
  const { sortBy, sortWithPriority, query } =
    await resolveDetailNavigation(searchParams);
  const { photos, photosGrid } = await getMediaNearIdCachedCached(
    photoId, sortBy, sortWithPriority, query,
  ).catch(error => {
    console.error('Failed to load detail navigation', { photoId, error });
    return { photos: [photo], photosGrid: [] };
  });
  return { photos, photosGrid, sortBy, query };
};

interface MediaProps {
  params: Promise<{ photoId: string }>
  searchParams: Promise<{ sort?: string | string[], query?: string | string[] }>
}

export async function generateMetadata({
  params,
}:MediaProps): Promise<Metadata> {
  const { photoId } = await params;
  const photo = await getPrimaryMedia(photoId);

  if (!photo) { return {}; }

  const title = titleForMedia(photo)?.toLocaleUpperCase();
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo });

  return {
    title,
    description: descriptionHtml,
    openGraph: {
      title,
      images,
      description,
      url,
    },
    twitter: {
      title,
      description,
      images,
      card: 'summary_large_image',
    },
  };
}

export default async function MediaPage({
  params,
  searchParams,
}: MediaProps) {
  const { photoId } = await params;
  const photo = await getPrimaryMedia(photoId);

  if (!photo) { redirect(PATH_ROOT); }

  return (
    <MediaDetailPage
      photo={photo}
      photos={[photo]}
      detailNavigation={loadDetailNavigation(photoId, photo, searchParams)}
    />
  );
}
