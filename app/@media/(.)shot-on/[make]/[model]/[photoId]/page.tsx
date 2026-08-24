import MediaCameraPage from '@app/shot-on/[make]/[model]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaCameraPage({
  params,
}: {
  params: Promise<{ photoId: string, make: string, model: string }>
}) {
  return <MediaDetailOverlay><MediaCameraPage params={params} /></MediaDetailOverlay>;
}
