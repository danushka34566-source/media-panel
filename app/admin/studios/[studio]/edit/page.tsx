import AdminChildPage from '@/components/AdminChildPage';
import { redirect } from 'next/navigation';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { PATH_ADMIN, PATH_ADMIN_STUDIOS, pathForStudio } from '@/app/path';
import MediaLightbox from '@/media/MediaLightbox';
import AdminMediaLibraryValueForm from '@/admin/AdminMediaLibraryValueForm';
import AdminBadge from '@/admin/AdminBadge';

const MAX_MEDIA_TO_SHOW = 6;

export default async function StudioPageEdit({
  params,
}: { params: Promise<{ studio: string }> }) {
  const studio = decodeURIComponent((await params).studio);
  const [{ count }, photos] = await Promise.all([
    getMediaMetaCached({ studio }),
    getMediaCached({ studio, limit: MAX_MEDIA_TO_SHOW }),
  ]);
  if (count === 0) { redirect(PATH_ADMIN); }
  return (
    <AdminChildPage
      backPath={PATH_ADMIN_STUDIOS}
      backLabel="Studios"
      breadcrumb={<AdminBadge entity={<span>{studio}</span>} count={count} />}
    >
      <AdminMediaLibraryValueForm
        value={studio}
        sourceType="studio"
        label="Studio"
        backPath={PATH_ADMIN_STUDIOS}
      >
        <MediaLightbox
          count={count}
          photos={photos}
          studio={studio}
          maxMediaToShow={MAX_MEDIA_TO_SHOW}
          moreLink={pathForStudio(studio)}
        />
      </AdminMediaLibraryValueForm>
    </AdminChildPage>
  );
}
