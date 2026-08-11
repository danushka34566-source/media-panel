import AdminBadge from './AdminBadge';
import { Album } from '@/album';
import MediaAlbum from '@/album/MediaAlbum';

export default async function AdminAlbumBadge({
  album,
  count,
  hideBadge,
}: {
  album: Album,
  count: number,
  hideBadge?: boolean,
}) {
  return (
    <AdminBadge
      entity={<MediaAlbum {...{ album }} hoverType="image" />}
      count={count}
      hideBadge={hideBadge}
    />
  );
}