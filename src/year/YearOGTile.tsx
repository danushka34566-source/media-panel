'use client';

import { Media, MediaDateRangePostgres, descriptionForMediaSet } from '@/media';
import { pathForYear, pathForYearImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { useAppText } from '@/i18n/state/client';

export default function YearOGTile({
  year,
  photos,
  count,
  dateRange,
  ...props
}: {
  year: string
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: appText.category.yearTitle(year),
      description: descriptionForMediaSet(
        photos,
        appText,
        undefined,
        undefined,
        count,
        dateRange,
      ),
      path: pathForYear(year),
      pathImage: pathForYearImage(year),
    }}/>
  );
} 