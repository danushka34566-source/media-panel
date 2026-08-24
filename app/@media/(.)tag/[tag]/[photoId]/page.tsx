import MediaTagPage from '@app/tag/[tag]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaTagPage({
  params,
}: {
  params: Promise<{ photoId: string, tag: string }>
}) {
  return <MediaDetailOverlay><MediaTagPage params={params} /></MediaDetailOverlay>;
}
