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
import {
  getMediaMetaCached,
  getMediaNearIdCached,
} from '@/media/cache';
import { cache } from 'react';

const getMediaNearIdCachedCached = cache((photoId: string, year: string) =>
  getMediaNearIdCached(
    photoId,
    { year, limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaYearProps {
  params: Promise<{ photoId: string, year: string }>
}

export async function generateMetadata({
  params,
}: MediaYearProps): Promise<Metadata> {
  const { photoId, year } = await params;

  const { photo } = await getMediaNearIdCachedCached(photoId, year);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, year });

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

export default async function MediaYearPage({
  params,
}: MediaYearProps) {
  const { photoId, year } = await params;

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, year);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ year: year });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      year,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
