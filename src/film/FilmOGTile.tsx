'use client';

import { Media, MediaDateRangePostgres } from '@/media';
import {
  pathForFilm,
  pathForFilmImage,
} from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { descriptionForFilmMedia, titleForFilm } from '.';
import { useAppText } from '@/i18n/state/client';

export default function FilmOGTile({
  film,
  photos,
  count,
  dateRange,
  ...props
}: {
  film: string
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: titleForFilm(film, photos, appText, count),
      description:
        descriptionForFilmMedia(photos, appText, true, count, dateRange),
      path: pathForFilm(film),
      pathImage: pathForFilmImage(film),
    }}/>
  );
};
