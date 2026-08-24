import MediaStudioPage from '@app/studio/[studio]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaStudioPage({
  params,
}: {
  params: Promise<{ photoId: string, studio: string }>
}) {
  return <MediaDetailOverlay><MediaStudioPage params={params} /></MediaDetailOverlay>;
}
