import MediaLensPage from '@app/lens/[make]/[model]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaLensPage({
  params,
}: {
  params: Promise<{ photoId: string, make: string, model: string }>
}) {
  return <MediaDetailOverlay><MediaLensPage params={params} /></MediaDetailOverlay>;
}
