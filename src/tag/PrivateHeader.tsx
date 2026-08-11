import { Media, photoQuantityText } from '@/media';
import MediaHeader from '@/media/MediaHeader';
import MediaPrivate from './MediaPrivate';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getAppText } from '@/i18n/state/server';

export default async function PrivateHeader({
  photos,
  selectedMedia,
  indexNumber,
  count,
}: {
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count: number
}) {
  const appText = await getAppText();
  return (
    <MediaHeader
      key="HiddenHeader"
      entity={<MediaPrivate contrast="high" />}
      entityDescription={photoQuantityText(count, appText, false, false)}
      photos={photos}
      selectedMedia={selectedMedia}
      indexNumber={indexNumber}
      count={count}
      hasAiTextGeneration={AI_CONTENT_GENERATION_ENABLED}
    />
  );
}
