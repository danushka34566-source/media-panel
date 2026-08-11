import { getMediaCached } from '@/media/cache';
import { IMAGE_OG_DIMENSION } from '@/image-response';
import MediaImageResponse from '@/media/MediaImageResponse';
import { getIBMPlexMono } from '@/app/font';
import { getImageResponseCacheControlHeaders } from '@/image-response/cache';
import { staticallyGenerateMediaIfConfigured } from '@/app/static';
import { safeMediaImageResponse } from '@/platforms/safe-photo-image-response';

export const generateStaticParams = staticallyGenerateMediaIfConfigured(
  'image',
);
export const dynamicParams = true;

export async function GET(
  _: Request,
  context: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await context.params;

  const [
    photo,
    { fontFamily, fonts },
    headers,
  ] = await Promise.all([
    getMediaCached(photoId),
    getIBMPlexMono(),
    getImageResponseCacheControlHeaders(),
  ]);
  
  if (!photo) { return new Response('Media not found', { status: 404 }); }

  const { width, height } = IMAGE_OG_DIMENSION;
  
  return safeMediaImageResponse(
    [photo],
    isNextImageReady => (
      <MediaImageResponse {...{
        photo,
        width,
        height,
        fontFamily,
        isNextImageReady,
      }} />
    ),
    { width, height, fonts, headers },
  );
}

