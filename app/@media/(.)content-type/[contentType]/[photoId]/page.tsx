import MediaContentTypePage from '@app/content-type/[contentType]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaContentTypePage({
  params,
}: {
  params: Promise<{ photoId: string, contentType: string }>
}) {
  return <MediaDetailOverlay><MediaContentTypePage params={params} /></MediaDetailOverlay>;
}
