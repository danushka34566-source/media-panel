import {
  RELATED_GRID_MEDIA_TO_SHOW,
  descriptionForMedia,
  titleForMedia,
} from '@/media';
import { Metadata } from 'next/types';
import { redirect } from 'next/navigation';
import {
  PATH_ROOT,
  absolutePathForMedia,
  absolutePathForMediaImage,
} from '@/app/path';
import MediaDetailPage from '@/media/MediaDetailPage';
import { getMediaNearIdCached } from '@/media/cache';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import { SORT_BY_OPTIONS, type SortBy } from '@/media/sort';
import { cache } from 'react';

export const maxDuration = 60;
// Nearby cards and next/previous navigation depend on the signed-in account.
export const dynamic = 'force-dynamic';

const getEffectiveMediaSortOptionsCached = cache(getEffectiveMediaSortOptions);
const resolveSortBy = async (searchParams: MediaProps['searchParams']) => {
  const { sort } = await searchParams;
  if (SORT_BY_OPTIONS.some(option => option.sortBy === sort)) {
    return sort as SortBy;
  }
  return (await getEffectiveMediaSortOptionsCached()).sortBy;
};

const getMediaNearIdCachedCached = cache((
  photoId: string,
  sortBy: SortBy,
) =>
  getMediaNearIdCached(
    photoId, {
      limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1,
      excludeFromFeeds: true,
      sortBy,
    },
  ));

interface MediaProps {
  params: Promise<{ photoId: string }>
  searchParams: Promise<{ sort?: string }>
}

export async function generateMetadata({
  params,
  searchParams,
}:MediaProps): Promise<Metadata> {
  const { photoId } = await params;
  const sortBy = await resolveSortBy(searchParams);
  const { photo } = await getMediaNearIdCachedCached(photoId, sortBy);

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
  const sortBy = await resolveSortBy(searchParams);
  const { photo, photos, photosGrid } =
    await getMediaNearIdCachedCached(photoId, sortBy);

  if (!photo) { redirect(PATH_ROOT); }

  return (
    <MediaDetailPage {...{ photo, photos, photosGrid, sortBy }} />
  );
}
