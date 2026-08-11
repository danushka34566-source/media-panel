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
import { getAlbumFromSlug } from '@/album/query';
import { Album } from '@/album';

const getMediaNearIdCachedCached = cache((photoId: string, album: Album) =>
  getMediaNearIdCached(
    photoId,
    { album, limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaTagProps {
  params: Promise<{ photoId: string, album: string }>
}

export async function generateMetadata({
  params,
}: MediaTagProps): Promise<Metadata> {
  const { photoId, album: albumFromParams } = await params;

  const albumSlug = decodeURIComponent(albumFromParams);

  const album = await getAlbumFromSlug(albumSlug);

  if (!album) { return {}; }

  const { photo } = await getMediaNearIdCachedCached(photoId, album);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, album });

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

export default async function MediaAlbumPage({
  params,
}: MediaTagProps) {
  const { photoId, album: albumFromParams } = await params;

  const albumSlug = decodeURIComponent(albumFromParams);

  const album = await getAlbumFromSlug(albumSlug);

  if (!album) { redirect(PATH_ROOT); }

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, album);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ album });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      album,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
