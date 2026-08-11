import { PARAM_UPLOAD_ORIGINAL_NAME, PARAM_UPLOAD_TITLE, PATH_ADMIN } from '@/app/path';
import { extractImageDataFromBlobPath } from '@/media/server';
import { redirect } from 'next/navigation';
import {
  getUniqueCategoriesCached,
  getUniqueFilmsCached,
  getUniqueRecipesCached,
  getUniqueTagsCached,
} from '@/media/cache';
import UploadPageClient from '@/media/UploadPageClient';
import {
  AI_CONTENT_GENERATION_ENABLED,
  BLUR_ENABLED,
} from '@/app/config';
import ErrorNote from '@/components/ErrorNote';
import { getRecipeTitleForData } from '@/media/query';
import { getAlbumsWithMeta } from '@/album/query';
import { addAiTextToFormData } from '@/media/ai/server';
import AppGrid from '@/components/AppGrid';

export const maxDuration = 60;

interface Params {
  params: Promise<{ uploadPath: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UploadPage({ params, searchParams }: Params) {
  const uploadPath = (await params).uploadPath;
  const title = (await searchParams)[PARAM_UPLOAD_TITLE];
  const originalFileNameParam = (await searchParams)[PARAM_UPLOAD_ORIGINAL_NAME];
  const originalFileName = typeof originalFileNameParam === 'string'
    ? decodeURIComponent(originalFileNameParam)
    : undefined;

  const [
    albums,
    uniqueRecipes,
    uniqueFilms,
    uniqueTags,
    uniqueCategories,
    {
      blobId,
      formDataFromExif: _formDataFromExif,
      imageResizedBase64: imageThumbnailBase64,
      shouldStripGpsData,
      error,
    },
  ] = await Promise.all([
    getAlbumsWithMeta(),
    getUniqueRecipesCached(),
    getUniqueFilmsCached(),
    getUniqueTagsCached(),
    getUniqueCategoriesCached(),
    extractImageDataFromBlobPath(uploadPath, {
      includeInitialMediaFields: true,
      generateBlurData: BLUR_ENABLED,
      generateResizedImage: AI_CONTENT_GENERATION_ENABLED,
    }),
  ]);

  const isDataMissing =
    !_formDataFromExif ||
    (AI_CONTENT_GENERATION_ENABLED && !imageThumbnailBase64);

  if (isDataMissing && !error) {
    // Only redirect if there's no error to report
    redirect(PATH_ADMIN);
  }

  const [
    recipeTitle,
    formDataFromExif,
  ] = await Promise.all([
    _formDataFromExif?.recipeData && _formDataFromExif.film
      ? getRecipeTitleForData(
        _formDataFromExif.recipeData, 
        _formDataFromExif.film,
      )
      : undefined,
    addAiTextToFormData({
      formData: _formDataFromExif,
      imageBase64: imageThumbnailBase64,
      uniqueTags,
    }),
  ]);

  const hasAiTextGeneration = AI_CONTENT_GENERATION_ENABLED;

  if (formDataFromExif) {
    if (recipeTitle) {
      formDataFromExif.recipeTitle = recipeTitle;
    }
    if (typeof title === 'string') {
      formDataFromExif.title = title;
    }
    if (originalFileName) {
      formDataFromExif.uploadOriginalFileName = originalFileName;
    }
  }

  return (
    !isDataMissing
      ? <UploadPageClient {...{
        blobId,
        formDataFromExif,
        albums,
        uniqueTags,
        uniqueCategories,
        uniqueRecipes,
        uniqueFilms,
        hasAiTextGeneration,
        imageThumbnailBase64,
        shouldStripGpsData,
      }} />
      : <AppGrid contentMain={
        <ErrorNote>
          {error ?? 'Unknown error'}
        </ErrorNote>
      }/>
  );
};
