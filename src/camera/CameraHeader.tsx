import { Media, MediaDateRangePostgres } from '@/media';
import MediaHeader from '@/media/MediaHeader';
import { Camera, cameraFromMedia } from '.';
import MediaCamera from './MediaCamera';
import { descriptionForCameraMedia } from './meta';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getAppText } from '@/i18n/state/server';

export default async function CameraHeader({
  camera: cameraProp,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  camera: Camera
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const appText = await getAppText();
  const camera = cameraFromMedia(photos[0], cameraProp);

  return (
    <MediaHeader
      camera={camera}
      entity={<MediaCamera
        {...{ camera }}
        contrast="high"
        hoverType="none"
      />}
      entityDescription={
        descriptionForCameraMedia(
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
