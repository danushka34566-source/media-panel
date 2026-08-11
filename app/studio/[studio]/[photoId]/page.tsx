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

interface MediaStudioProps {
  params: Promise<{ photoId: string, studio: string }>
}

export async function generateMetadata({
  params,
}: MediaStudioProps): Promise<Metadata> {
  const { photoId, studio: studioParam } = await params;
  const studio = decodeURIComponent(studioParam);
  const { photo } = await getStringEntityMediaNearIdCached(photoId, 'studio', studio);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, studio });

  return {
    title,
    description: descriptionHtml,
    openGraph: { title, images, description, url },
    twitter: { title, description, images, card: 'summary_large_image' },
  };
}

export default async function MediaStudioPage({ params }: MediaStudioProps) {
  const { photoId, studio: studioParam } = await params;
  const studio = decodeURIComponent(studioParam);
  const { photo, photos, photosGrid, indexNumber } =
    await getStringEntityMediaNearIdCached(photoId, 'studio', studio);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ studio });

  return (
    <MediaDetailPage
      photo={photo}
      photos={photos}
      photosGrid={photosGrid}
      studio={studio}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      headerOverride={
        <MediaStringEntityHeader
          kind="studio"
          value={studio}
          path={getStringEntityPath('studio', studio)}
          photos={photos}
          selectedMedia={photo}
          indexNumber={indexNumber}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ studio }}
        />
      }
    />
  );
}
