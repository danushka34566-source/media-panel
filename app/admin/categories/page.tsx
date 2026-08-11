import AdminCategoriesTable from '@/admin/AdminCategoriesTable';
import AppGrid from '@/components/AppGrid';
import { getUniqueCategories } from '@/media/query';

export default async function AdminCategoriesPage() {
  const categories = await getUniqueCategories().catch(() => []);

  return (
    <AppGrid
      contentMain={
        <div className="space-y-6">
          <div className="space-y-4">
            <AdminCategoriesTable {...{ categories }} />
          </div>
        </div>}
    />
  );
}
