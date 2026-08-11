import AdminVideoLibraryValueTable from '@/admin/AdminVideoLibraryValueTable';
import AppGrid from '@/components/AppGrid';
import { getUniqueVideoContentTypesWithMeta } from '@/media/query';
import { deleteMediaContentTypeGloballyFormAction } from '@/media/actions';

export default async function AdminContentTypesPage() {
  const contentTypes = await getUniqueVideoContentTypesWithMeta().catch(() => []);

  return (
    <AppGrid
      contentMain={
        <div className="space-y-6">
          <div className="space-y-4">
            <AdminVideoLibraryValueTable
              items={contentTypes.map(item => ({ ...item, value: item.contentType }))}
              valueKey="contentType"
              label="content type entries"
              deleteAction={deleteMediaContentTypeGloballyFormAction}
            />
          </div>
        </div>}
    />
  );
}
