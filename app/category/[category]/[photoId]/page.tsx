import {
  RELATED_GRID_MEDIA_TO_SHOW,
  descriptionForMedia,
  titleForMedia,
} from '@/media';
import { Metadata } from 'next/types';
import { redirect } from 'next/navigation';
import { PATH_ROOT, absolutePathForMedia, absolutePathForMediaImage } from '@/app/path';
import MediaDetailPage from '@/media/MediaDetailPage';
import { getMediaMetaCached } from '@/media/cache';
import { MediaStringEntityHeader } from '@/media/MediaStringEntity';
import { getStringEntityMediaNearIdCached } from '@/media/stringEntityPage';

interface MediaCategoryProps {
  params: Promise<{ photoId: string, category: string }>
}

export async function generateMetadata({
  params,
}: MediaCategoryProps): Promise<Metadata> {
  const { photoId, category: categoryParam } = await params;
  const category = decodeURIComponent(categoryParam);
  const { photo } = await getStringEntityMediaNearIdCached(photoId, 'category', category);

  if (!photo) { return {}; }

  const title = titleForMedia(photo);
  const description = descriptionForMedia(photo);
  const descriptionHtml = descriptionForMedia(photo, true);
  const images = absolutePathForMediaImage(photo);
  const url = absolutePathForMedia({ photo, category });

  return {
    title,
    description: descriptionHtml,
    openGraph: { title, images, description, url },
    twitter: { title, description, images, card: 'summary_large_image' },
  };
}

export default async function MediaCategoryPage({ params }: MediaCategoryProps) {
  const { photoId, category: categoryParam } = await params;
  const category = decodeURIComponent(categoryParam);
  const { photo, photos, photosGrid, indexNumber } =
    await getStringEntityMediaNearIdCached(photoId, 'category', category);

  if (!photo) { redirect(PATH_ROOT); }

  const { count, dateRange } = await getMediaMetaCached({ category });

  return (
    <MediaDetailPage
      photo={photo}
      photos={photos}
      photosGrid={photosGrid}
      category={category}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      headerOverride={
        <MediaStringEntityHeader
          kind="category"
          value={category}
          path={`/category/${category}`}
          photos={photos}
          selectedMedia={photo}
          indexNumber={indexNumber}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ category }}
        />
      }
    />
  );
}
