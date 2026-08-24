import MediaYearPage from '@app/year/[year]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaYearPage({
  params,
}: {
  params: Promise<{ photoId: string, year: string }>
}) {
  return <MediaDetailOverlay><MediaYearPage params={params} /></MediaDetailOverlay>;
}
