import MediaFilmPage from '@app/film/[film]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaFilmPage({
  params,
}: {
  params: Promise<{ photoId: string, film: string }>
}) {
  return <MediaDetailOverlay><MediaFilmPage params={params} /></MediaDetailOverlay>;
}
