'use client';

import { descriptionForMediaSet, Media, MediaDateRangePostgres } from '@/media';
import MediaHeader from '@/media/MediaHeader';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import MediaYear from './MediaYear';
import { useAppText } from '@/i18n/state/client';

export default function YearHeader({
  year,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  year: string
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const appText = useAppText();

  return (
    <MediaHeader
      year={year}
      entity={<MediaYear
        year={year}
        contrast="high"
        hoverType="none"
      />}
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