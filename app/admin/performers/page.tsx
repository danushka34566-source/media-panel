import AdminVideoLibraryValueTable from '@/admin/AdminVideoLibraryValueTable';
import AppGrid from '@/components/AppGrid';
import { getUniquePerformersWithMeta } from '@/media/query';
import { deleteMediaPerformerGloballyFormAction } from '@/media/actions';

export default async function AdminPerformersPage() {
  const performers = await getUniquePerformersWithMeta().catch(() => []);

  return (
    <AppGrid
      contentMain={
        <div className="space-y-6">
          <div className="space-y-4">
            <AdminVideoLibraryValueTable
              items={performers.map(item => ({ ...item, value: item.performer }))}
              valueKey="performer"
              label="performer entries"
              deleteAction={deleteMediaPerformerGloballyFormAction}
            />
          </div>
        </div>}
    />
  );
}
