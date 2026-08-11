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

interface MediaPerformerProps {
  params: Promise<{ photoId: string, performer: string }>
}

export async function generateMetadata({
  params,
}: MediaPerformerProps): Promise<Metadata> {
  const { photoId, performer: performerParam } = await params;
  const performer = decodeURIComponent(performerParam);
  const { photo } = await getStringEntityMediaNearIdCached(photoId, 'performer', performer);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, performer });

  return {
    title,
    description: descriptionHtml,
    openGraph: { title, images, description, url },
    twitter: { title, description, images, card: 'summary_large_image' },
  };
}

export default async function MediaPerformerPage({ params }: MediaPerformerProps) {
  const { photoId, performer: performerParam } = await params;
  const performer = decodeURIComponent(performerParam);
  const { photo, photos, photosGrid, indexNumber } =
    await getStringEntityMediaNearIdCached(photoId, 'performer', performer);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ performer });

  return (
    <MediaDetailPage
      photo={photo}
      photos={photos}
      photosGrid={photosGrid}
      performer={performer}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      headerOverride={
        <MediaStringEntityHeader
          kind="performer"
          value={performer}
          path={getStringEntityPath('performer', performer)}
          photos={photos}
          selectedMedia={photo}
          indexNumber={indexNumber}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ performer }}
        />
      }
    />
  );
}
