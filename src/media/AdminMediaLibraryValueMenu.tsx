'use client';

import MoreMenu from '@/components/more/MoreMenu';
import IconEdit from '@/components/icons/IconEdit';
import IconTrash from '@/components/icons/IconTrash';
import { TbFolderUp } from 'react-icons/tb';
import { useAppState } from '@/app/AppState';
import { usePathname, useRouter } from 'next/navigation';
import {
  deleteMediaCategoryGloballyFormAction,
  deleteMediaContentTypeGloballyFormAction,
  deleteMediaPerformerGloballyFormAction,
  deleteMediaStudioGloballyFormAction,
  deleteMediaTagGloballyAction,
} from './actions';
import {
  pathForAdminCategoryEdit,
  pathForAdminContentTypeEdit,
  pathForAdminPerformerEdit,
  pathForAdminStudioEdit,
  pathForAdminTagEdit,
  pathForTag,
  PATH_ROOT,
} from '@/app/path';
import { formatTag } from '@/tag';

export type AdminMediaLibraryValueType =
  | 'category'
  | 'studio'
  | 'performer'
  | 'contentType'
  | 'tag';

const editPathFor = (type: AdminMediaLibraryValueType, value: string) => {
  switch (type) {
    case 'category': return pathForAdminCategoryEdit(value);
    case 'studio': return pathForAdminStudioEdit(value);
    case 'performer': return pathForAdminPerformerEdit(value);
    case 'contentType': return pathForAdminContentTypeEdit(value);
    case 'tag': return pathForAdminTagEdit(value);
  }
};

const formFieldFor = (type: AdminMediaLibraryValueType) =>
  type === 'contentType' ? 'contentType' : type;

const deleteConfirmationFor = (type: AdminMediaLibraryValueType, value: string, count: number) =>
  `Remove "${type === 'tag' ? formatTag(value) : value}" from ${count} media item${count === 1 ? '' : 's'}?`;

export default function AdminMediaLibraryValueMenu({
  type,
  value,
  count = 0,
}: {
  type: AdminMediaLibraryValueType
  value: string
  count?: number
}) {
  const path = usePathname();
  const router = useRouter();
  const { confirmDialog, canDelete } = useAppState();
  const editPath = editPathFor(type, value);

  const deleteValue = async () => {
    const didConfirm = await confirmDialog?.({
      description: deleteConfirmationFor(type, value, count),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!didConfirm) { return false; }

    if (type === 'tag') {
      return deleteMediaTagGloballyAction(value, path).then(() => {
        if (path === pathForTag(value)) { router.push(PATH_ROOT); }
      });
    }

    const action = {
      category: deleteMediaCategoryGloballyFormAction,
      studio: deleteMediaStudioGloballyFormAction,
      performer: deleteMediaPerformerGloballyFormAction,
      contentType: deleteMediaContentTypeGloballyFormAction,
    }[type];
    const formData = new FormData();
    formData.set(formFieldFor(type), value);
    await action(formData);
    router.push(PATH_ROOT);
    return true;
  };

  return (
    <MoreMenu
      ariaLabel={`${type} menu`}
      className="m-3"
      classNameButton="h-3.5 translate-y-1"
      side="bottom"
      sections={[{
        items: [{
          label: 'Edit',
          icon: <IconEdit size={15} className="translate-y-[0.5px]" />,
          href: editPath,
        }, {
          label: 'Upgrade',
          icon: <TbFolderUp size={16} className="translate-x-[-1px]" />,
          href: editPath,
        }],
      }, ...(canDelete ? [{
        items: [{
          icon: <IconTrash className="translate-x-[-1px]" />,
          label: 'Delete',
          className: 'text-error *:hover:text-error',
          color: 'red' as const,
          action: deleteValue,
        }],
      }] : [])]}
    />
  );
}
