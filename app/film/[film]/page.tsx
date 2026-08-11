import { INFINITE_SCROLL_GRID_INITIAL } from '@/media';
import { getUniqueFilms } from '@/media/query';
import { generateMetaForFilm } from '@/film';
import FilmOverview from '@/film/FilmOverview';
import { getMediaFilmDataCached } from '@/film/data';
import { Metadata } from 'next/types';
import { cache } from 'react';
import { PATH_ROOT } from '@/app/path';
import { redirect } from 'next/navigation';
import { staticallyGenerateCategoryIfConfigured } from '@/app/static';
import { getAppText } from '@/i18n/state/server';

const getMediaFilmDataCachedCached = cache((film: string) =>
  getMediaFilmDataCached({ film, limit: INFINITE_SCROLL_GRID_INITIAL }));

export const generateStaticParams = staticallyGenerateCategoryIfConfigured(
  'films',
  'page',
  getUniqueFilms,
  films => films.map(({ film }) => ({ film })),
);
export const dynamicParams = true;

interface FilmProps {
  params: Promise<{ film: string }>
}

export async function generateMetadata({
  params,
}: FilmProps): Promise<Metadata> {
  const { film } = await params;

  const [
    photos,
    { count, dateRange },
  ] = await getMediaFilmDataCachedCached(film);
  
  if (photos.length === 0) { return {}; }
  
  const appText = await getAppText();
  
  const {
    url,
    title,
    description,
    images,
  } = generateMetaForFilm(film, photos, appText, count, dateRange);

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

export default async function FilmPage({
  params,
}: FilmProps) {
  const { film } = await params;

  const [
    photos,
    { count, dateRange },
  ] =  await getMediaFilmDataCachedCached(film);

  if (photos.length === 0) { redirect(PATH_ROOT); } 

  return (
    <FilmOverview {...{
      film,
      photos,
      count,
      dateRange,
    }} />
  );
}
