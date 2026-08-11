import { getMediaCached } from '@/media/cache';
import {
  IMAGE_OG_DIMENSION_SMALL,
  MAX_MEDIA_TO_SHOW_PER_CATEGORY,
} from '@/image-response';
import RecentsImageResponse from
  '@/recents/RecentsImageResponse';
import { getIBMPlexMono } from '@/app/font';
import { getImageResponseCacheControlHeaders } from '@/image-response/cache';
import { getAppText } from '@/i18n/state/server';
import { SHOW_RECENTS } from '@/app/config';
import { safeMediaImageResponse } from '@/platforms/safe-photo-image-response';

export const dynamic = 'force-static';

export async function GET() {
  const [
    photos,
    { fontFamily, fonts },
    headers,
  ] = await Promise.all([
    SHOW_RECENTS
      ? getMediaCached({
        limit: MAX_MEDIA_TO_SHOW_PER_CATEGORY,
        recent: true,
      }).catch(() => [])
      : [],
    getIBMPlexMono(),
    getImageResponseCacheControlHeaders(),
  ]);

  const appText = await getAppText();

  const title = appText.category.recentPlural.toLocaleUpperCase();

  const { width, height } = IMAGE_OG_DIMENSION_SMALL;

  return safeMediaImageResponse(
    photos,
    isNextImageReady => (
      <RecentsImageResponse {...{
        title,
        photos: isNextImageReady ? photos : [],
        width,
        height,
        fontFamily,
      }}/>
    ),
    { width, height, fonts, headers },
  );
}
