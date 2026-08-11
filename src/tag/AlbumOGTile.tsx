'use client';

import { Media, MediaDateRangePostgres } from '@/media';
import { pathForAlbum, pathForAlbumImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { useAppText } from '@/i18n/state/client';
import { Album, descriptionForAlbumMedia, titleForAlbum } from '@/album';

export default function AlbumOGTile({
  album,
  photos,
  count,
  dateRange,
  ...props
}: {
  album: Album
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: titleForAlbum(album, photos, appText, count),
      description: descriptionForAlbumMedia(
        photos,
        appText,
        true,
        count,
        dateRange,
      ),
      path: pathForAlbum(album),
      pathImage: pathForAlbumImage(album),
    }}/>
  );
};
