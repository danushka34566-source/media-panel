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
import { getMediaMetaCached, getMediaNearIdCached } from '@/media/cache';
import { cache } from 'react';

const getMediaNearIdCachedCached = cache((photoId: string, tag: string) =>
  getMediaNearIdCached(
    photoId,
    { tag, limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaTagProps {
  params: Promise<{ photoId: string, tag: string }>
}

export async function generateMetadata({
  params,
}: MediaTagProps): Promise<Metadata> {
  const { photoId, tag: tagFromParams } = await params;

  const tag = decodeURIComponent(tagFromParams);

  const { photo } = await getMediaNearIdCachedCached(photoId, tag);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, tag });

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

export default async function MediaTagPage({
  params,
}: MediaTagProps) {
  const { photoId, tag: tagFromParams } = await params;

  const tag = decodeURIComponent(tagFromParams);

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, tag);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ tag });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      tag,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
