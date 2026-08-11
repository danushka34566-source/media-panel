import { redirect } from 'next/navigation';
import {
  getMediaNoStore,
  getUniqueCategoriesCached,
  getUniqueFilmsCached,
  getUniquePerformersCached,
  getUniqueRecipesCached,
  getUniqueStudiosCached,
  getUniqueTagsCached,
  getUniqueVideoContentTypesCached,
} from '@/media/cache';
import { PATH_ADMIN } from '@/app/path';
import MediaEditPageClient from '@/media/MediaEditPageClient';
import {
  AI_CONTENT_GENERATION_ENABLED,
  IS_PREVIEW,
} from '@/app/config';
import { resizeImageFromUrl } from '@/media/server';
import {
  getOptimizedMediaUrlForManipulation,
} from '@/media/storage';
import { getAlbumsWithMeta, getAlbumTitlesForMedia } from '@/album/query';
import { isVideoMedia } from '@/media';

export default async function MediaEditPage({
  params,
}: {
  params: Promise<{ photoId: string }>
}) {
  const { photoId } = await params;

  const [
    photo,
    photoAlbumTitles,
    albums,
    uniqueTags,
    uniqueCategories,
    uniqueStudios,
    uniquePerformers,
    uniqueContentTypes,
    uniqueRecipes,
    uniqueFilms,
  ] = await Promise.all([
    getMediaNoStore(photoId, true),
    getAlbumTitlesForMedia(photoId),
    getAlbumsWithMeta(),
    getUniqueTagsCached(),
    getUniqueCategoriesCached(),
    getUniqueStudiosCached(),
    getUniquePerformersCached(),
    getUniqueVideoContentTypesCached(),
    getUniqueRecipesCached(),
    getUniqueFilmsCached(),
  ]);

  if (!photo) { redirect(PATH_ADMIN); }

  const hasAiTextGeneration = AI_CONTENT_GENERATION_ENABLED;
  
  // Only generate image thumbnails when AI generation is enabled
  const imageThumbnailBase64 = (
    AI_CONTENT_GENERATION_ENABLED &&
    !isVideoMedia(photo)
  )
    ? await resizeImageFromUrl(
      getOptimizedMediaUrlForManipulation(photo.url, IS_PREVIEW),
    ).catch(() => '')
    : '';

  return (
    <MediaEditPageClient {...{
      photo,
      photoAlbumTitles,
      albums,
      uniqueTags,
      uniqueCategories,
      uniqueStudios,
      uniquePerformers,
      uniqueContentTypes,
      uniqueRecipes,
      uniqueFilms,
      hasAiTextGeneration,
      imageThumbnailBase64,
    }} />
  );
};

