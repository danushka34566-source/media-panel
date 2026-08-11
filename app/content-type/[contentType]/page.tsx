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

interface ContentTypePageProps {
  params: Promise<{ contentType: string }>
}

export async function generateMetadata({
  params,
}: ContentTypePageProps): Promise<Metadata> {
  const contentType = decodeURIComponent((await params).contentType);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('contentType', contentType);

  if (photos.length === 0) { return {}; }
  return generateMetadataForStringEntity('contentType', contentType, photos, count, dateRange);
}

export default async function ContentTypePage({ params }: ContentTypePageProps) {
  const contentType = decodeURIComponent((await params).contentType);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('contentType', contentType);

  if (photos.length === 0) { redirect(PATH_ROOT); }

  return (
    <MediaStringEntityOverview
      cacheKey={getStringEntityCacheKey('contentType', contentType)}
      photos={photos}
      count={count}
      categoryProps={{ contentType }}
      header={
        <MediaStringEntityHeader
          kind="content type"
          value={contentType}
          path={getStringEntityPath('contentType', contentType)}
          photos={photos}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ contentType }}
        />
      }
    />
  );
}
