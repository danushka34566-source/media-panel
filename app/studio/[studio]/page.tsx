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

interface StudioPageProps {
  params: Promise<{ studio: string }>
}

export async function generateMetadata({
  params,
}: StudioPageProps): Promise<Metadata> {
  const studio = decodeURIComponent((await params).studio);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('studio', studio);

  if (photos.length === 0) { return {}; }
  return generateMetadataForStringEntity('studio', studio, photos, count, dateRange);
}

export default async function StudioPage({ params }: StudioPageProps) {
  const studio = decodeURIComponent((await params).studio);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('studio', studio);

  if (photos.length === 0) { redirect(PATH_ROOT); }

  return (
    <MediaStringEntityOverview
      cacheKey={getStringEntityCacheKey('studio', studio)}
      photos={photos}
      count={count}
      categoryProps={{ studio }}
      header={
        <MediaStringEntityHeader
          kind="studio"
          value={studio}
          path={getStringEntityPath('studio', studio)}
          photos={photos}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ studio }}
        />
      }
    />
  );
}
