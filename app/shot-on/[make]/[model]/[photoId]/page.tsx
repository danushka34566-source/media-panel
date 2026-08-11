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
import {
  MediaCameraProps,
  cameraFromMedia,
  formatCameraParams,
} from '@/camera';
import { cache } from 'react';

const getMediaNearIdCachedCached = cache((
  photoId: string,
  make: string,
  model: string,
) =>
  getMediaNearIdCached(
    photoId, {
      camera: formatCameraParams({ make, model }),
      limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1,
    },
  ));

export async function generateMetadata({
  params,
}: MediaCameraProps): Promise<Metadata> {
  const { photoId, make, model } = await params;

  const { photo } = await getMediaNearIdCachedCached(photoId, make, model);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({
    photo,
    camera: cameraFromMedia(photo, { make, model }),
  });

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

export default async function MediaCameraPage({
  params,
}: MediaCameraProps) {
  const { photoId, make, model } = await params;

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, make, model);

  if (!photo) { redirect(PATH_ROOT); }

  const camera = cameraFromMedia(photo, { make, model });

  const { count, dateRange } = await getMediaMetaCached({ camera });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      camera,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
