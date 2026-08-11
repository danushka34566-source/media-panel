import AppGrid from '@/components/AppGrid';
import { getUniqueTagsCached } from '@/media/cache';
import AdminUploadsClient from '@/admin/AdminUploadsClient';
import { getAlbumsWithMeta } from '@/album/query';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminUploadsPage() {
  const [
    uniqueAlbums,
    uniqueTags,
  ] = await Promise.all([
    getAlbumsWithMeta(),
    getUniqueTagsCached(),
  ]);

  return (
    <AppGrid
      contentMain={
        <AdminUploadsClient {...{
          urls: [],
          uniqueAlbums,
          uniqueTags,
          hideManualActions: true,
        }} />
      }
    />
  );
}
