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
import {
  formatLensParams,
  getLensMediaFromParams,
  lensFromMedia,
  LensMediaProps,
} from '@/lens';

const getMediaNearIdCachedCached = cache((
  photoId: string,
  make: string | undefined,
  model: string,
) =>
  getMediaNearIdCached(
    photoId, {
      lens: formatLensParams({ make, model }),
      limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1,
    },
  ));

export async function generateMetadata({
  params,
}: LensMediaProps): Promise<Metadata> {
  const { photoId, make, model } = await getLensMediaFromParams(params);

  const { photo } = await getMediaNearIdCachedCached(photoId, make, model);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({
    photo,
    lens: lensFromMedia(photo, { make, model }),
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

export default async function MediaLensPage({
  params,
}: LensMediaProps) {
  const { photoId, make, model } = await getLensMediaFromParams(params);

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, make, model);

  if (!photo) { redirect(PATH_ROOT); }

  const lens = lensFromMedia(photo, { make, model });

  const { count, dateRange } = await getMediaMetaCached({ lens });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      lens,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
