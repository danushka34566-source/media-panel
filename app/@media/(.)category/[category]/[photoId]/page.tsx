import MediaCategoryPage from '@app/category/[category]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaCategoryPage({
  params,
}: {
  params: Promise<{ photoId: string, category: string }>
}) {
  return <MediaDetailOverlay><MediaCategoryPage params={params} /></MediaDetailOverlay>;
}
