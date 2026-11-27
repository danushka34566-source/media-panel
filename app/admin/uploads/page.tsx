import AppGrid from '@/components/AppGrid';
import AdminUploadsClient from '@/admin/AdminUploadsClient';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminUploadsPage() {
  return (
    <AppGrid
      contentMain={
        <AdminUploadsClient {...{
          urls: [],
          uniqueAlbums: [],
          uniqueTags: [],
          hideManualActions: true,
        }} />
      }
    />
  );
}
