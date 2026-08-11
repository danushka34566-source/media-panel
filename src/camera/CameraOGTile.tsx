'use client';

import { Media, MediaDateRangePostgres } from '@/media';
import { pathForCamera, pathForCameraImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { Camera } from '.';
import { descriptionForCameraMedia, titleForCamera } from './meta';
import { useAppText } from '@/i18n/state/client';

export default function CameraOGTile({
  camera,
  photos,
  count,
  dateRange,
  ...props
}: {
  camera: Camera
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: titleForCamera(camera, photos, appText, count),
      description:
        descriptionForCameraMedia(
          photos,
          appText,
          true,
          count,
          dateRange,
        ),
      path: pathForCamera(camera),
      pathImage: pathForCameraImage(camera),
    }}/>
  );
};
