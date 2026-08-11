import AdminVideoLibraryValueTable from '@/admin/AdminVideoLibraryValueTable';
import AppGrid from '@/components/AppGrid';
import { getUniqueStudiosWithMeta } from '@/media/query';
import { deleteMediaStudioGloballyFormAction } from '@/media/actions';

export default async function AdminStudiosPage() {
  const studios = await getUniqueStudiosWithMeta().catch(() => []);

  return (
    <AppGrid
      contentMain={
        <div className="space-y-6">
          <div className="space-y-4">
            <AdminVideoLibraryValueTable
              items={studios.map(item => ({ ...item, value: item.studio }))}
              valueKey="studio"
              label="studio entries"
              deleteAction={deleteMediaStudioGloballyFormAction}
            />
          </div>
        </div>}
    />
  );
}
