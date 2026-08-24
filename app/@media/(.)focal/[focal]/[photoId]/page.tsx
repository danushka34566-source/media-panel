import MediaFocalPage from '@app/focal/[focal]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaFocalPage({
  params,
}: {
  params: Promise<{ photoId: string, focal: string }>
}) {
  return <MediaDetailOverlay><MediaFocalPage params={params} /></MediaDetailOverlay>;
}
