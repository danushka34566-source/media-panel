import { getMediaCached } from '@/media/cache';
import {
  IMAGE_OG_DIMENSION_SMALL,
  MAX_MEDIA_TO_SHOW_PER_CATEGORY,
} from '@/image-response';
import TagImageResponse from '@/tag/TagImageResponse';
import { getIBMPlexMono } from '@/app/font';
import { ImageResponse } from 'next/og';
import { getImageResponseCacheControlHeaders } from '@/image-response/cache';
import { getUniqueTags } from '@/media/query';
import { staticallyGenerateCategoryIfConfigured } from '@/app/static';

export const generateStaticParams = staticallyGenerateCategoryIfConfigured(
  'tags',
  'image',
  getUniqueTags,
  tags => tags.map(({ tag }) => ({ tag })),
);
export const dynamicParams = true;

export async function GET(
  _: Request,
  context: { params: Promise<{ tag: string }> },
) {
  const { tag } = await context.params;

  const [
    photos,
    { fontFamily, fonts },
    headers,
  ] = await Promise.all([
    getMediaCached({ limit: MAX_MEDIA_TO_SHOW_PER_CATEGORY, tag }),
    getIBMPlexMono(),
    getImageResponseCacheControlHeaders(),
  ]);

  const { width, height } = IMAGE_OG_DIMENSION_SMALL;

  return new ImageResponse(
    <TagImageResponse {...{
      tag,
      photos,
      width,
      height,
      fontFamily,
    }}/>,
    { width, height, fonts, headers },
  );
}
