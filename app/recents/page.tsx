import { INFINITE_SCROLL_GRID_INITIAL } from '@/media';
import { generateMetaForRecents } from '@/recents/meta';
import RecentsOverview from '@/recents/RecentsOverview';
import { getMediaRecentsDataCached } from '@/recents/data';
import { Metadata } from 'next/types';
import { cache } from 'react';
import { PATH_ROOT } from '@/app/path';
import { redirect } from 'next/navigation';
import { getAppText } from '@/i18n/state/server';

const getMediaRecentsDataCachedCached = cache(() =>
  getMediaRecentsDataCached({ limit: INFINITE_SCROLL_GRID_INITIAL }),
);

export async function generateMetadata(): Promise<Metadata> {
  const data = await getMediaRecentsDataCachedCached().catch(() => undefined);
  if (!data) { return {}; }
  const [
    photos,
    { count, dateRange },
  ] = data;
  
  if (photos.length === 0) { return {}; }
  
  const appText = await getAppText();
  
  const {
    url,
    title,
    description,
    images,
  } = generateMetaForRecents(photos, appText, count, dateRange);

  return {
    title,
    openGraph: {
      title,
      description,
      images,
      url,
    },
    twitter: {
      images,
      description,
      card: 'summary_large_image',
    },
    description,
  };
}

export default async function RecentsPage() {
  const [
    photos,
    { count, dateRange },
  ] = await getMediaRecentsDataCachedCached();

  if (photos.length === 0) { redirect(PATH_ROOT); } 

  return (
    <RecentsOverview {...{
      photos,
      count,
      dateRange,
    }} />
  );
}
