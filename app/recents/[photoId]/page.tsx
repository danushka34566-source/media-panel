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
import RecentsHeader from '@/recents/RecentsHeader';

const getMediaNearIdCachedCached = cache((photoId: string) =>
  getMediaNearIdCached(
    photoId,
    { recent: true, limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaRecentsProps {
  params: Promise<{ photoId: string }>
}

export async function generateMetadata({
  params,
}: MediaRecentsProps): Promise<Metadata> {
  const { photoId } = await params;

  const { photo } = await getMediaNearIdCachedCached(photoId);

  if (!photo) { return {}; }

  const title = titleForMedia(photo)?.toLocaleUpperCase();
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, recent: true });

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

export default async function MediaRecentsPage({
  params,
}: MediaRecentsProps) {
  const { photoId } = await params;

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ recent: true });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      recent: true,
      indexNumber,
      count,
      dateRange,
      header: <RecentsHeader
        photos={photos}
        selectedMedia={photo}
        indexNumber={indexNumber}
        count={count}
        dateRange={dateRange}
      />,
    }} />
  );
} 
