import MediaPerformerPage from '@app/performer/[performer]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaPerformerPage({
  params,
}: {
  params: Promise<{ photoId: string, performer: string }>
}) {
  return <MediaDetailOverlay><MediaPerformerPage params={params} /></MediaDetailOverlay>;
}
