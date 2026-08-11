import AdminChildPage from '@/components/AdminChildPage';
import { redirect } from 'next/navigation';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import AdminTagForm from '@/admin/AdminTagForm';
import { PATH_ADMIN, PATH_ADMIN_TAGS, pathForTag } from '@/app/path';
import MediaLightbox from '@/media/MediaLightbox';
import AdminTagBadge from '@/admin/AdminTagBadge';

const MAX_MEDIA_TO_SHOW = 6;

interface Props {
  params: Promise<{ tag: string }>
}

export default async function TagPageEdit({
  params,
}: Props) {
  const { tag: tagFromParams } = await params;

  const tag = decodeURIComponent(tagFromParams);
  
  const [
    { count },
    photos,
  ] = await Promise.all([
    getMediaMetaCached({ tag }),
    getMediaCached({ tag, limit: MAX_MEDIA_TO_SHOW }),
  ]);

  if (count === 0) { redirect(PATH_ADMIN); }

  return (
    <AdminChildPage
      backPath={PATH_ADMIN_TAGS}
      backLabel="Tags"
      breadcrumb={<AdminTagBadge {...{ tag, count, hideBadge: true }} />}
    >
      <AdminTagForm {...{ tag }}>
        <MediaLightbox
          {...{ count, photos, tag }}
          maxMediaToShow={MAX_MEDIA_TO_SHOW}
          moreLink={pathForTag(tag)}
        />
      </AdminTagForm>
    </AdminChildPage>
  );
};
