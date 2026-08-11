'use client';

import { descriptionForMediaSet, Media, MediaDateRangePostgres } from '@/media';
import MediaHeader from '@/media/MediaHeader';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { useAppText } from '@/i18n/state/client';
import MediaRecents from './MediaRecents';

export default function RecentsHeader({
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const appText = useAppText();

  return (
    <MediaHeader
      recent={true}
      entity={<MediaRecents hoverType="none" />}
      entityDescription={descriptionForMediaSet(
        photos,
        appText,
        undefined,
        undefined,
        count,
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
