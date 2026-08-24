import FormWithConfirm from '@/components/FormWithConfirm';
import AdminTable from '@/admin/AdminTable';
import { Fragment } from 'react';
import DeleteFormButton from '@/admin/DeleteFormButton';
import { clsx } from 'clsx/lite';
import AdminBadge from './AdminBadge';
import { deleteMediaCategoryGloballyFormAction } from '@/media/actions';
import Authorized from '@/auth/Authorized';
import EditButton from './EditButton';
import { pathForAdminCategoryEdit } from '@/app/path';

type CategoryWithMeta = {
  category: string
  count: number
  lastModified: Date
};

export default async function AdminCategoriesTable({
  categories,
}: {
  categories: CategoryWithMeta[]
}) {
  return (
    <AdminTable>
      {categories
        .sort((a, b) => a.category.localeCompare(b.category))
        .map(({ category, count }) =>
          <Fragment key={category}>
            <div className="pr-2 col-span-2">
              <AdminBadge
                entity={
                  <span className="font-medium uppercase">
                    {category}
                  </span>
                }
                count={count}
              />
            </div>
            <div className={clsx(
              'flex flex-nowrap',
              'gap-2 sm:gap-3 items-center',
            )}>
              <EditButton path={pathForAdminCategoryEdit(category)} />
              <Authorized capability="delete"><FormWithConfirm
                action={deleteMediaCategoryGloballyFormAction}
                confirmText={`Remove "${category}" from all media?`}
              >
                <input type="hidden" name="category" value={category} />
                <DeleteFormButton clearLocalState />
              </FormWithConfirm></Authorized>
            </div>
          </Fragment>)}
    </AdminTable>
  );
}
