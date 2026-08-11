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

const getMediaNearIdCachedCached = cache((
  photoId: string,
  film: string,
) =>
  getMediaNearIdCached(
    photoId,
    { film, limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaFilmProps {
  params: Promise<{ photoId: string, film: string }>
}

export async function generateMetadata({
  params,
}: MediaFilmProps): Promise<Metadata> {
  const { photoId, film } = await params;

  const { photo } = await getMediaNearIdCachedCached(photoId, film);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, film: film });

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

export default async function MediaFilmPage({
  params,
}: MediaFilmProps) {
  const { photoId, film } = await params;

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, film);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ film: film });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      film: film,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
