'use client';

import { Media, MediaDateRangePostgres } from '@/media';
import {
  pathForFocalLength,
  pathForFocalLengthImage,
} from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { descriptionForFocalLengthMedia, titleForFocalLength } from '.';
import { useAppText } from '@/i18n/state/client';

export default function FocalLengthOGTile({
  focal,
  photos,
  count,
  dateRange,
  ...props
}: {
  focal: number
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: titleForFocalLength(focal, photos, appText, count),
      description:
        descriptionForFocalLengthMedia(
          photos,
          appText,
          true,
          count,
          dateRange,
        ),
      path: pathForFocalLength(focal),
      pathImage: pathForFocalLengthImage(focal),
    }}/>
  );
};
