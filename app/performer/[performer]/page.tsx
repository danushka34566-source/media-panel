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

interface PerformerPageProps {
  params: Promise<{ performer: string }>
}

export async function generateMetadata({
  params,
}: PerformerPageProps): Promise<Metadata> {
  const performer = decodeURIComponent((await params).performer);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('performer', performer);

  if (photos.length === 0) { return {}; }
  return generateMetadataForStringEntity('performer', performer, photos, count, dateRange);
}

export default async function PerformerPage({ params }: PerformerPageProps) {
  const performer = decodeURIComponent((await params).performer);
  const [photos, { count, dateRange }] =
    await getStringEntityOverviewDataCached('performer', performer);

  if (photos.length === 0) { redirect(PATH_ROOT); }

  return (
    <MediaStringEntityOverview
      cacheKey={getStringEntityCacheKey('performer', performer)}
      photos={photos}
      count={count}
      categoryProps={{ performer }}
      header={
        <MediaStringEntityHeader
          kind="performer"
          value={performer}
          path={getStringEntityPath('performer', performer)}
          photos={photos}
          count={count}
          dateRange={dateRange}
          includeShareButton
          categoryProps={{ performer }}
        />
      }
    />
  );
}
