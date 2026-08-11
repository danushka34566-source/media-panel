'use client';

import { Media, MediaDateRangePostgres } from '@/media';
import { pathForTag, pathForTagImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { descriptionForTaggedMedia, titleForTag } from '.';
import { useAppText } from '@/i18n/state/client';

export default function TagOGTile({
  tag,
  photos,
  count,
  dateRange,
  ...props
}: {
  tag: string
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: titleForTag(tag, photos, appText, count),
      description: descriptionForTaggedMedia(
        photos,
        appText,
        true,
        count,
        dateRange,
      ),
      path: pathForTag(tag),
      pathImage: pathForTagImage(tag),
    }}/>
  );
};
