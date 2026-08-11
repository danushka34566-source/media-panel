import MediaTag from '@/tag/MediaTag';
import MediaFavs from '@/tag/MediaFavs';
import { isTagFavs } from '@/tag';
import AdminBadge from './AdminBadge';

export default async function AdminTagBadge({
  tag,
  count,
  hideBadge,
}: {
  tag: string,
  count: number,
  hideBadge?: boolean,
}) {
  return (
    <AdminBadge
      className={isTagFavs(tag) ? 'translate-y-[-0.5px]' : undefined}
      entity={isTagFavs(tag)
        ? <MediaFavs hoverType="image" />
        : <MediaTag {...{ tag }} hoverType="image" />}
      count={count}
      hideBadge={hideBadge}
    />
  );
}