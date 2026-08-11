import { getMediaCached } from '@/media/cache';
import {
  IMAGE_OG_DIMENSION_SMALL,
  MAX_MEDIA_TO_SHOW_PER_CATEGORY,
} from '@/image-response';
import { getIBMPlexMono } from '@/app/font';
import { ImageResponse } from 'next/og';
import { getImageResponseCacheControlHeaders } from '@/image-response/cache';
import { getUniqueRecipes } from '@/media/query';
import RecipeImageResponse from '@/recipe/RecipeImageResponse';
import { staticallyGenerateCategoryIfConfigured } from '@/app/static';

export const generateStaticParams = staticallyGenerateCategoryIfConfigured(
  'recipes',
  'image',
  getUniqueRecipes,
  recipes => recipes.map(({ recipe }) => ({ recipe })),
);
export const dynamicParams = true;

export async function GET(
  _: Request,
  context: { params: Promise<{ recipe: string }> },
) {
  const { recipe } = await context.params;

  const [
    photos,
    { fontFamily, fonts },
    headers,
  ] = await Promise.all([
    getMediaCached({ recipe, limit: MAX_MEDIA_TO_SHOW_PER_CATEGORY }),
    getIBMPlexMono(),
    getImageResponseCacheControlHeaders(),
  ]);

  const { width, height } = IMAGE_OG_DIMENSION_SMALL;

  return new ImageResponse(
    <RecipeImageResponse {...{
      recipe,
      photos,
      width,
      height,
      fontFamily,
    }}/>,
    { width, height, fonts, headers },
  );
}
