import { Media, MediaDateRangePostgres } from '@/media';
import MediaHeader from '@/media/MediaHeader';
import { Lens, lensFromMedia } from '.';
import MediaLens from './MediaLens';
import { descriptionForLensMedia } from './meta';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getAppText } from '@/i18n/state/server';

export default async function LensHeader({
  lens: lensProp,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  lens: Lens
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const lens = lensFromMedia(photos[0], lensProp);
  const appText = await getAppText();

  return (
    <MediaHeader
      lens={lens}
      entity={<MediaLens
        {...{ lens }}
        contrast="high"
        hoverType="none"
        longText
      />}
      entityDescription={
        descriptionForLensMedia(
          photos,
          appText,
          undefined,
          count,
          dateRange,
        )}
      photos={photos}
      selectedMedia={selectedMedia}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      hasAiTextGeneration={AI_CONTENT_GENERATION_ENABLED}
      includeShareButton
    />
  );
}
