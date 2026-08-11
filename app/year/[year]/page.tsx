import { INFINITE_SCROLL_GRID_INITIAL } from '@/media';
import { getUniqueYears } from '@/media/query';
import { generateMetaForYear } from '@/year/meta';
import YearOverview from '@/year/YearOverview';
import { getMediaYearDataCached } from '@/year/data';
import { Metadata } from 'next/types';
import { cache } from 'react';
import { PATH_ROOT } from '@/app/path';
import { redirect } from 'next/navigation';
import { staticallyGenerateCategoryIfConfigured } from '@/app/static';
import { getAppText } from '@/i18n/state/server';

const getMediaYearDataCachedCached = cache((year: string) =>
  getMediaYearDataCached({ year, limit: INFINITE_SCROLL_GRID_INITIAL }));

export const generateStaticParams = staticallyGenerateCategoryIfConfigured(
  'years',
  'page',
  getUniqueYears,
  years => years.map(({ year }) => ({ year })),
);
export const dynamicParams = true;

interface YearProps {
  params: Promise<{ year: string }>
}

export async function generateMetadata({
  params,
}: YearProps): Promise<Metadata> {
  const { year } = await params;

  const [
    photos,
    { count, dateRange },
  ] = await getMediaYearDataCachedCached(year);
  
  if (photos.length === 0) { return {}; }
  
  const appText = await getAppText();
  
  const {
    url,
    title,
    description,
    images,
  } = generateMetaForYear(year, photos, appText, count, dateRange);

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

export default async function YearPage({
  params,
}: YearProps) {
  const { year } = await params;

  const [
    photos,
    { count, dateRange },
  ] = await getMediaYearDataCachedCached(year);

  if (photos.length === 0) { redirect(PATH_ROOT); } 

  return (
    <YearOverview {...{
      year,
      photos,
      count,
      dateRange,
    }} />
  );
} 
