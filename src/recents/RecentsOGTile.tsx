'use client';

import { Media, MediaDateRangePostgres, descriptionForMediaSet } from '@/media';
import { PREFIX_RECENTS, pathForRecentsImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { useAppText } from '@/i18n/state/client';

export default function RecentsOGTile({
  photos,
  count,
  dateRange,
  ...props
}: {
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: appText.category.recentTitle,
      description: descriptionForMediaSet(
        photos,
        appText,
        undefined,
        undefined,
        count,
        dateRange,
      ),
      path: PREFIX_RECENTS,
      pathImage: pathForRecentsImage(),
    }}/>
  );
} 