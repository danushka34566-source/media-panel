import MediaPrivatePage from '@app/tag/private/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedPrivateMediaPage({
  params,
}: {
  params: Promise<{ photoId: string }>
}) {
  return <MediaDetailOverlay><MediaPrivatePage params={params} /></MediaDetailOverlay>;
}
