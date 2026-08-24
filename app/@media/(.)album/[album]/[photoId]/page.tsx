import MediaAlbumPage from '@app/album/[album]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaAlbumPage({
  params,
}: {
  params: Promise<{ photoId: string, album: string }>
}) {
  return <MediaDetailOverlay><MediaAlbumPage params={params} /></MediaDetailOverlay>;
}
