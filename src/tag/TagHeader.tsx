import { Media, MediaDateRangePostgres } from '@/media';
import MediaTag from './MediaTag';
import { descriptionForTaggedMedia, isTagFavs } from '.';
import MediaHeader from '@/media/MediaHeader';
import MediaFavs from './MediaFavs';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getAppText } from '@/i18n/state/server';

export default async function TagHeader({
  tag,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  tag: string
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const appText = await getAppText();
  return (
    <MediaHeader
      tag={tag}
      entity={isTagFavs(tag) 
        ? <MediaFavs
          contrast="high"
          hoverType="none"
        />
        : <MediaTag
          tag={tag}
          contrast="high"
          hoverType="none"
          showAdminMenu
        />}
      entityVerb={appText.category.tagged}
      entityDescription={descriptionForTaggedMedia(
        photos,
        appText,
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
