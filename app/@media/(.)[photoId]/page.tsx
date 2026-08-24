import MediaPage from '@app/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaPage({
  params,
}: {
  params: Promise<{ photoId: string }>
}) {
  return (
    <MediaDetailOverlay>
      <MediaPage params={params} />
    </MediaDetailOverlay>
  );
}
