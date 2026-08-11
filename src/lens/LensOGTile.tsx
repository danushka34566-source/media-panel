import { Media, MediaDateRangePostgres } from '@/media';
import { pathForLens, pathForLensImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { Lens } from '.';
import { titleForLens, descriptionForLensMedia } from './meta';
import { useAppText } from '@/i18n/state/client';

export default function LensOGTile({
  lens,
  photos,
  count,
  dateRange,
  ...props
}: {
  lens: Lens
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: titleForLens(lens, photos, appText, count),
      description: descriptionForLensMedia(
        photos,
        appText,
        true,
        count,
        dateRange,
      ),
      path: pathForLens(lens),
      pathImage: pathForLensImage(lens),
    }}/>
  );
};
