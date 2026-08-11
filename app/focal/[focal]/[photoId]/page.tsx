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
import { getMediaNearIdCached, getMediaMetaCached } from '@/media/cache';
import { cache } from 'react';
import { getFocalLengthFromString } from '@/focal';

const getMediaNearIdCachedCached = cache((photoId: string, focal: number) =>
  getMediaNearIdCached(
    photoId,
    { focal, limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaFocalLengthProps {
  params: Promise<{ photoId: string, focal: string }>
}

export async function generateMetadata({
  params,
}: MediaFocalLengthProps): Promise<Metadata> {
  const { photoId, focal: focalString } = await params;

  const focal = getFocalLengthFromString(focalString);

  const { photo } = await getMediaNearIdCachedCached(photoId, focal);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, focal });

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

export default async function MediaFocalLengthPage({
  params,
}: MediaFocalLengthProps) {
  const { photoId, focal: focalString } = await params;

  const focal = getFocalLengthFromString(focalString);

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, focal);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ focal });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      focal,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
