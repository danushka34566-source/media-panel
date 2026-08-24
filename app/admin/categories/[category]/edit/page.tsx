import AdminChildPage from '@/components/AdminChildPage';
import { redirect } from 'next/navigation';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import {
  PATH_ADMIN,
  PATH_ADMIN_CATEGORIES,
  pathForCategory,
} from '@/app/path';
import MediaLightbox from '@/media/MediaLightbox';
import AdminMediaLibraryValueForm from '@/admin/AdminMediaLibraryValueForm';
import AdminBadge from '@/admin/AdminBadge';

const MAX_MEDIA_TO_SHOW = 6;

export default async function CategoryPageEdit({
  params,
}: { params: Promise<{ category: string }> }) {
  const category = decodeURIComponent((await params).category);
  const [{ count }, photos] = await Promise.all([
    getMediaMetaCached({ category }),
    getMediaCached({ category, limit: MAX_MEDIA_TO_SHOW }),
  ]);
  if (count === 0) { redirect(PATH_ADMIN); }
  return (
    <AdminChildPage
      backPath={PATH_ADMIN_CATEGORIES}
      backLabel="Categories"
      breadcrumb={<AdminBadge entity={<span>{category}</span>} count={count} />}
    >
      <AdminMediaLibraryValueForm
        value={category}
        sourceType="category"
        label="Category"
        backPath={PATH_ADMIN_CATEGORIES}
      >
        <MediaLightbox
          count={count}
          photos={photos}
          category={category}
          maxMediaToShow={MAX_MEDIA_TO_SHOW}
          moreLink={pathForCategory(category)}
        />
      </AdminMediaLibraryValueForm>
    </AdminChildPage>
  );
}
