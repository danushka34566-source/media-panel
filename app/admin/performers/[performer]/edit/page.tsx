import AdminChildPage from '@/components/AdminChildPage';
import { redirect } from 'next/navigation';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { PATH_ADMIN, PATH_ADMIN_PERFORMERS, pathForPerformer } from '@/app/path';
import MediaLightbox from '@/media/MediaLightbox';
import AdminMediaLibraryValueForm from '@/admin/AdminMediaLibraryValueForm';
import AdminBadge from '@/admin/AdminBadge';

const MAX_MEDIA_TO_SHOW = 6;

export default async function PerformerPageEdit({
  params,
}: { params: Promise<{ performer: string }> }) {
  const performer = decodeURIComponent((await params).performer);
  const [{ count }, photos] = await Promise.all([
    getMediaMetaCached({ performer }),
    getMediaCached({ performer, limit: MAX_MEDIA_TO_SHOW }),
  ]);
  if (count === 0) { redirect(PATH_ADMIN); }
  return (
    <AdminChildPage
      backPath={PATH_ADMIN_PERFORMERS}
      backLabel="Performers"
      breadcrumb={<AdminBadge entity={<span>{performer}</span>} count={count} />}
    >
      <AdminMediaLibraryValueForm
        value={performer}
        sourceType="performer"
        label="Performer"
        backPath={PATH_ADMIN_PERFORMERS}
      >
        <MediaLightbox
          count={count}
          photos={photos}
          performer={performer}
          maxMediaToShow={MAX_MEDIA_TO_SHOW}
          moreLink={pathForPerformer(performer)}
        />
      </AdminMediaLibraryValueForm>
    </AdminChildPage>
  );
}
