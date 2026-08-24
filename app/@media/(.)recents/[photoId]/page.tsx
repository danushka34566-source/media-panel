import MediaRecentsPage from '@app/recents/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaRecentsPage({
  params,
}: {
  params: Promise<{ photoId: string }>
}) {
  return <MediaDetailOverlay><MediaRecentsPage params={params} /></MediaDetailOverlay>;
}
