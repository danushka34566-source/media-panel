import { Metadata } from 'next/types';
import { INFINITE_SCROLL_GRID_INITIAL } from '@/media';
import { cache } from 'react';
import { getUniqueLenses } from '@/media/query';
import { generateMetaForLens } from '@/lens/meta';
import { getMediaLensDataCached } from '@/lens/data';
import LensOverview from '@/lens/LensOverview';
import {
  getLensFromParams,
  LensProps,
  safelyGenerateLensStaticParams,
} from '@/lens';
import {
  staticallyGenerateCategoryIfConfigured,
} from '@/app/static';
import { getAppText } from '@/i18n/state/server';

const getMediaLensDataCachedCached = cache((
  make: string | undefined,
  model: string,
) => getMediaLensDataCached(
  make,
  model,
  INFINITE_SCROLL_GRID_INITIAL,
));

export const generateStaticParams = staticallyGenerateCategoryIfConfigured(
  'lenses',
  'page',
  getUniqueLenses,
  safelyGenerateLensStaticParams,
);
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: LensProps): Promise<Metadata> {
  const { make, model } = await getLensFromParams(params);

  const [
    photos,
    { count, dateRange },
    lens,
  ] = await getMediaLensDataCachedCached(make, model);

  const appText = await getAppText();

  const {
    url,
    title,
    description,
    images,
  } = generateMetaForLens(lens, photos, appText, count, dateRange);

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

export default async function LensPage({
  params,
}: LensProps) {
  const { make, model } = await getLensFromParams(params);

  const [
    photos,
    { count, dateRange },
    lens,
  ] = await getMediaLensDataCachedCached(make, model);

  return (
    <LensOverview {...{ lens, photos, count, dateRange }} />
  );
}
