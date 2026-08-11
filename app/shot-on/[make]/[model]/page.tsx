import { Metadata } from 'next/types';
import { CameraProps, formatCameraParams } from '@/camera';
import { generateMetaForCamera } from '@/camera/meta';
import { INFINITE_SCROLL_GRID_INITIAL } from '@/media';
import { getMediaCameraDataCached } from '@/camera/data';
import CameraOverview from '@/camera/CameraOverview';
import { cache } from 'react';
import { getUniqueCameras } from '@/media/query';
import { staticallyGenerateCategoryIfConfigured } from '@/app/static';
import { getAppText } from '@/i18n/state/server';

const getMediaCameraDataCachedCached = cache((
  make: string,
  model: string,
) => getMediaCameraDataCached(
  make,
  model,
  INFINITE_SCROLL_GRID_INITIAL,
));

export const generateStaticParams = staticallyGenerateCategoryIfConfigured(
  'cameras',
  'page',
  getUniqueCameras,
  cameras => cameras.map(({ camera }) => formatCameraParams(camera)),
);
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: CameraProps): Promise<Metadata> {
  const { make, model } = await params;

  const [
    photos,
    { count, dateRange },
    camera,
  ] = await getMediaCameraDataCachedCached(make, model);

  const appText = await getAppText();

  const {
    url,
    title,
    description,
    images,
  } = generateMetaForCamera(camera, photos, appText, count, dateRange);

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

export default async function CameraPage({
  params,
}: CameraProps) {
  const { make, model } = await params;

  const [
    photos,
    { count, dateRange },
    camera,
  ] = await getMediaCameraDataCachedCached(make, model);

  return (
    <CameraOverview {...{ camera, photos, count, dateRange }} />
  );
}
