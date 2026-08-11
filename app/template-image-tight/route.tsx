import { getMediaCached } from '@/media/cache';
import {
  IMAGE_OG_DIMENSION,
  MAX_MEDIA_TO_SHOW_TEMPLATE_TIGHT,
} from '@/image-response';
import TemplateImageResponse from
  '@/app/TemplateImageResponse';
import { getIBMPlexMono } from '@/app/font';
import { getImageResponseCacheControlHeaders } from '@/image-response/cache';
import { safeMediaImageResponse } from '@/platforms/safe-photo-image-response';

export async function GET() {
  const [
    photos,
    { fontFamily, fonts },
    headers,
  ] = await Promise.all([
    getMediaCached({
      sortWithPriority: true,
      limit: MAX_MEDIA_TO_SHOW_TEMPLATE_TIGHT,
    }).catch(() => []),
    getIBMPlexMono(),
    getImageResponseCacheControlHeaders(),
  ]);

  const { width, height } = IMAGE_OG_DIMENSION;

  return safeMediaImageResponse(
    photos,
    isNextImageReady => (
      <TemplateImageResponse {...{
        photos: isNextImageReady ? photos : [],
        includeHeader: false,
        outerMargin: 0,
        width,
        height,
        fontFamily,
      }}/>
    ),
    {
      width,
      height,
      fonts,
      headers,
    },
  );
}
