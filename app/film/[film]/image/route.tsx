import { getMediaCached } from '@/media/cache';
import {
  IMAGE_OG_DIMENSION_SMALL,
  MAX_MEDIA_TO_SHOW_PER_CATEGORY,
} from '@/image-response';
import FilmImageResponse from '@/film/FilmImageResponse';
import { getIBMPlexMono } from '@/app/font';
import { ImageResponse } from 'next/og';
import { getImageResponseCacheControlHeaders } from '@/image-response/cache';
import { getUniqueFilms } from '@/media/query';
import { staticallyGenerateCategoryIfConfigured } from '@/app/static';

export const generateStaticParams = staticallyGenerateCategoryIfConfigured(
  'films',
  'image',
  getUniqueFilms,
  films => films.map(({ film }) => ({ film })),
);
export const dynamicParams = true;

export async function GET(
  _: Request,
  context: { params: Promise<{ film: string }> },
) {
  const { film } = await context.params;

  const [
    photos,
    { fontFamily, fonts },
    headers,
  ] = await Promise.all([
    getMediaCached({
      limit: MAX_MEDIA_TO_SHOW_PER_CATEGORY,
      film: film,
    }),
    getIBMPlexMono(),
    getImageResponseCacheControlHeaders(),
  ]);

  const { width, height } = IMAGE_OG_DIMENSION_SMALL;

  return new ImageResponse(
    <FilmImageResponse {...{
      film,
      photos,
      width,
      height,
      fontFamily,
    }}/>,
    { width, height, fonts, headers },
  );
}
