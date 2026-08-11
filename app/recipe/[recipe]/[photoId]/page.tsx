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

const getMediaNearIdCachedCached = cache((
  photoId: string,
  recipe: string,
) =>
  getMediaNearIdCached(
    photoId,
    { recipe, limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
  ));

interface MediaRecipeProps {
  params: Promise<{ photoId: string, recipe: string }>
}

export async function generateMetadata({
  params,
}: MediaRecipeProps): Promise<Metadata> {
  const { photoId, recipe: recipeFromParams } = await params;

  const recipe = decodeURIComponent(recipeFromParams);

  const { photo } = await getMediaNearIdCachedCached(photoId, recipe);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, recipe });

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

export default async function MediaRecipePage({
  params,
}: MediaRecipeProps) {
  const { photoId, recipe: recipeFromParams } = await params;

  const recipe = decodeURIComponent(recipeFromParams);

  const { photo, photos, photosGrid, indexNumber } =
    await getMediaNearIdCachedCached(photoId, recipe);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ recipe });

  return (
    <MediaDetailPage {...{
      photo,
      photos,
      photosGrid,
      recipe,
      indexNumber,
      count,
      dateRange,
    }} />
  );
}
