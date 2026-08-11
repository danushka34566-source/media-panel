import FormWithConfirm from '@/components/FormWithConfirm';
import AdminTable from '@/admin/AdminTable';
import { Fragment } from 'react';
import DeleteFormButton from '@/admin/DeleteFormButton';
import { clsx } from 'clsx/lite';
import AdminBadge from './AdminBadge';
import Authorized from '@/auth/Authorized';

export default async function AdminVideoLibraryValueTable({
  items,
  valueKey,
  label,
  deleteAction,
}: {
  items: {
    value: string
    count: number
    lastModified: Date
  }[]
  valueKey: string
  label: string
  deleteAction: (formData: FormData) => Promise<unknown>
}) {
  return (
    <AdminTable>
      {items
        .sort((a, b) => a.value.localeCompare(b.value))
        .map(({ value, count }) =>
          <Fragment key={value}>
            <div className="pr-2 col-span-2">
              <AdminBadge
                entity={
                  <span className="font-medium uppercase">
                    {value}
                  </span>
                }
                count={count}
              />
            </div>
            <div className={clsx(
              'flex flex-nowrap',
              'gap-2 sm:gap-3 items-center',
            )}>
              <Authorized capability="delete"><FormWithConfirm
                action={deleteAction}
                confirmText={`Remove "${value}" from all media ${label}?`}
              >
                <input type="hidden" name={valueKey} value={value} />
                <DeleteFormButton clearLocalState />
              </FormWithConfirm></Authorized>
            </div>
          </Fragment>)}
    </AdminTable>
  );
}
