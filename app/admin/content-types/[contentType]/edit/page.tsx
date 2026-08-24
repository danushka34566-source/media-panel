import AdminChildPage from '@/components/AdminChildPage';
import { redirect } from 'next/navigation';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import {
  PATH_ADMIN,
  PATH_ADMIN_CONTENT_TYPES,
  pathForContentType,
} from '@/app/path';
import MediaLightbox from '@/media/MediaLightbox';
import AdminMediaLibraryValueForm from '@/admin/AdminMediaLibraryValueForm';
import AdminBadge from '@/admin/AdminBadge';

const MAX_MEDIA_TO_SHOW = 6;

export default async function ContentTypePageEdit({
  params,
}: { params: Promise<{ contentType: string }> }) {
  const contentType = decodeURIComponent((await params).contentType);
  const [{ count }, photos] = await Promise.all([
    getMediaMetaCached({ contentType }),
    getMediaCached({ contentType, limit: MAX_MEDIA_TO_SHOW }),
  ]);
  if (count === 0) { redirect(PATH_ADMIN); }
  return (
    <AdminChildPage
      backPath={PATH_ADMIN_CONTENT_TYPES}
      backLabel="Content Types"
      breadcrumb={<AdminBadge entity={<span>{contentType}</span>} count={count} />}
    >
      <AdminMediaLibraryValueForm
        value={contentType}
        sourceType="contentType"
        label="Content Type"
        backPath={PATH_ADMIN_CONTENT_TYPES}
      >
        <MediaLightbox
          count={count}
          photos={photos}
          contentType={contentType}
          maxMediaToShow={MAX_MEDIA_TO_SHOW}
          moreLink={pathForContentType(contentType)}
        />
      </AdminMediaLibraryValueForm>
    </AdminChildPage>
  );
}
