import { Media, MediaDateRangePostgres } from '@/media';
import { descriptionForFocalLengthMedia } from '.';
import MediaHeader from '@/media/MediaHeader';
import MediaFocalLength from './MediaFocalLength';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getAppText } from '@/i18n/state/server';

export default async function FocalLengthHeader({
  focal,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  focal: number
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const appText = await getAppText();
  return (
    <MediaHeader
      focal={focal}
      entity={<MediaFocalLength
        focal={focal}
        contrast="high"
        hoverType="none"
      />}
      entityDescription={descriptionForFocalLengthMedia(
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
