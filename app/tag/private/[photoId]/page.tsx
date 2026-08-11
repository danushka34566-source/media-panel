import {
  RELATED_GRID_MEDIA_TO_SHOW,
  descriptionForMedia,
  titleForMedia,
} from '@/media';
import MediaDetailPage from '@/media/MediaDetailPage';
import {
  getMediaMetaCached,
  getMediaNearIdCached,
} from '@/media/cache';
import { PATH_ROOT, absolutePathForMedia } from '@/app/path';
import { TAG_PRIVATE } from '@/tag';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cache } from 'react';

const getMediaNearIdCachedCached = cache((photoId: string) =>
  getMediaNearIdCached(
    photoId,
    { hidden: 'only' , limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaTagProps {
  params: Promise<{ photoId: string }>
}

export async function generateMetadata({
  params,
}: MediaTagProps): Promise<Metadata> {
  const { photoId } = await params;

  const { photo } = await getMediaNearIdCachedCached(photoId);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const url = absolutePathForMedia({ photo, tag: TAG_PRIVATE });

  return {
    title,
    description: descriptionHtml,
    openGraph: {
      title,
      description,
      url,
    },
    twitter: {
      title,
      description,
      card: 'summary_large_image',
    },
  };
}

export default async function MediaTagPrivatePage({
  params,
}: MediaTagProps) {
  const { photoId } = await params;

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ hidden: 'only' });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      indexNumber,
      count,
      dateRange,
      tag: TAG_PRIVATE,
      shouldShare: false,
      includeFavoriteInAdminMenu: false,
    }} />
  );
}
