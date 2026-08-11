import {
  descriptionForMedia,
  titleForMedia,
} from '@/media';
import { Metadata } from 'next/types';
import { redirect } from 'next/navigation';
import { PATH_ROOT, absolutePathForMedia, absolutePathForMediaImage } from '@/app/path';
import MediaDetailPage from '@/media/MediaDetailPage';
import { getMediaMetaCached } from '@/media/cache';
import { MediaStringEntityHeader } from '@/media/MediaStringEntity';
import { getStringEntityMediaNearIdCached, getStringEntityPath } from '@/media/stringEntityPage';

interface MediaContentTypeProps {
  params: Promise<{ photoId: string, contentType: string }>
}

export async function generateMetadata({
  params,
}: MediaContentTypeProps): Promise<Metadata> {
  const { photoId, contentType: contentTypeParam } = await params;
  const contentType = decodeURIComponent(contentTypeParam);
  const { photo } = await getStringEntityMediaNearIdCached(photoId, 'contentType', contentType);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, contentType });

  return {
    title,
    description: descriptionHtml,
    openGraph: { title, images, description, url },
    twitter: { title, description, images, card: 'summary_large_image' },
  };
}

export default async function MediaContentTypePage({ params }: MediaContentTypeProps) {
  const { photoId, contentType: contentTypeParam } = await params;
  const contentType = decodeURIComponent(contentTypeParam);
  const { photo, photos, photosGrid, indexNumber } =
    await getStringEntityMediaNearIdCached(photoId, 'contentType', contentType);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ contentType });

  return (
    <MediaDetailPage
      photo={photo}
      photos={photos}
      photosGrid={photosGrid}
      contentType={contentType}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      headerOverride={
        <MediaStringEntityHeader
          kind="content type"
          value={contentType}
          path={getStringEntityPath('contentType', contentType)}
          photos={photos}
          selectedMedia={photo}
          indexNumber={indexNumber}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ contentType }}
        />
      }
    />
  );
}
