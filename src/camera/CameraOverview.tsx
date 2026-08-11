import { Media, MediaDateRangePostgres } from '@/media';
import { Camera, createCameraKey } from '.';
import CameraHeader from './CameraHeader';
import MediaGridContainer from '@/media/MediaGridContainer';

export default function CameraOverview({
  camera,
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  camera: Camera,
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `camera-${createCameraKey(camera)}`,
      photos,
      count,
      camera,
      animateOnFirstLoadOnly,
      header: <CameraHeader {...{
        camera,
        photos,
        count,
        dateRange,
      }} />,
    }} />
  );
}
