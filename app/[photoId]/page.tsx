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
import { getMediaCached, getMediaNearIdCached } from '@/media/cache';
import { cache } from 'react';
import { staticallyGenerateMediaIfConfigured } from '@/app/static';

export const maxDuration = 60;

const getMediaNearIdCachedCached = cache(async (photoId: string) => {
  const photo = await getMediaCached(photoId);
  // Omit related photos when photo is excluded from feeds
  if (!photo?.excludeFromFeeds) {
    try {
      return await getMediaNearIdCached(
        photoId, {
          limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1,
          excludeFromFeeds: true,
        },
      );
    } catch (error) {
      // A related-media query must not make the primary detail page fail.
      // This is especially important with Supabase transaction-pooler
      // connections, where a transient read can fail independently.
      console.error('Failed to load related media; rendering the primary item', {
        photoId,
        error,
      });
    }
  }

  return {
    photo,
    photos: [],
    photosGrid: [],
    indexNumber: 0,
  };
});

export const generateStaticParams = staticallyGenerateMediaIfConfigured(
  'page',
);
export const dynamicParams = true;

interface MediaProps {
  params: Promise<{ photoId: string }>
}

export async function generateMetadata({
  params,
}:MediaProps): Promise<Metadata> {
  const { photoId } = await params;
  const { photo } = await getMediaNearIdCachedCached(photoId);

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
}: MediaProps) {
  const { photoId } = await params;
  const { photo, photos, photosGrid } =
    await getMediaNearIdCachedCached(photoId);

  if (!photo) { redirect(PATH_ROOT); }

  return (
    <MediaDetailPage {...{ photo, photos, photosGrid }} />
  );
}
