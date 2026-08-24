import MediaRecipePage from '@app/recipe/[recipe]/[photoId]/page';
import MediaDetailOverlay from '@/media/MediaDetailOverlay';

export default function InterceptedMediaRecipePage({
  params,
}: {
  params: Promise<{ photoId: string, recipe: string }>
}) {
  return <MediaDetailOverlay><MediaRecipePage params={params} /></MediaDetailOverlay>;
}
