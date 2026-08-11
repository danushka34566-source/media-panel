import { PATH_ROOT } from '@/app/path';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MediaStringEntityHeader, MediaStringEntityOverview } from '@/media/MediaStringEntity';
import {
  generateMetadataForStringEntity,
  getStringEntityCacheKey,
  getStringEntityOverviewDataCached,
  getStringEntityPath,
} from '@/media/stringEntityPage';

interface CategoryPageProps {
  params: Promise<{ category: string }>
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const category = decodeURIComponent((await params).category);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('category', category);

  if (photos.length === 0) { return {}; }
  return generateMetadataForStringEntity('category', category, photos, count, dateRange);
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const category = decodeURIComponent((await params).category);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('category', category);

  if (photos.length === 0) { redirect(PATH_ROOT); }

  return (
    <MediaStringEntityOverview
      cacheKey={getStringEntityCacheKey('category', category)}
      photos={photos}
      count={count}
      categoryProps={{ category }}
      header={
        <MediaStringEntityHeader
          kind="category"
          value={category}
          path={getStringEntityPath('category', category)}
          photos={photos}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ category }}
        />
      }
    />
  );
}
