import MoreMenu from '@/components/more/MoreMenu';
import { TbFolderUp } from 'react-icons/tb';
import { deleteTagConfirmationText, formatTag } from '.';
import {
  deleteMediaTagGloballyAction,
  upgradeTagToAlbumAction,
} from '@/media/actions';
import { toastSuccess } from '@/toast';
import { pathForAdminAlbumEdit, pathForAdminTagEdit } from '@/app/path';
import { usePathname, useRouter } from 'next/navigation';
import { useAppText } from '@/i18n/state/client';
import IconEdit from '@/components/icons/IconEdit';
import IconTrash from '@/components/icons/IconTrash';
import { useAppState } from '@/app/AppState';

export default function AdminTagMenu({
  tag,
  count,
}: {
  tag: string
  count: number
}) {
  const appText = useAppText();
  const path = usePathname();
  const router = useRouter();
  const { confirmDialog, canDelete } = useAppState();

  return (
    <MoreMenu
      ariaLabel="Tag menu"
      className="m-3"
      classNameButton="h-3.5 translate-y-1"
      side="bottom"
      sections={[{
        items: [{
          label: 'Edit',
          icon: <IconEdit
            size={15}
            className="translate-y-[0.5px]"
          />,
          href: pathForAdminTagEdit(tag),
        }, {
          icon: <TbFolderUp
            size={16}
            className="translate-x-[-1px]"
          />,
          label: 'Upgrade',
          action: async () => {
            const didConfirm = await confirmDialog?.({
              title: 'Upgrade Tag',
              description:
                `Are you sure you want to upgrade "${formatTag(tag)}" to an album?`,
              confirmLabel: 'Upgrade',
            });
            if (!didConfirm) { return false; }
            return upgradeTagToAlbumAction(tag)
              .then(() => {
                toastSuccess(`"${formatTag(tag)}" upgraded to album`);
                router.push(pathForAdminAlbumEdit(tag));
              });
          },
        }],
      }, ...(canDelete ? [{
        items: [{
          icon: <IconTrash
            className="translate-x-[-1px]"
          />,
          label: 'Delete',
          className: 'text-error *:hover:text-error',
          color: 'red' as const,
          action: async () => {
            const didConfirm = await confirmDialog?.({
              description: deleteTagConfirmationText(tag, count, appText),
              confirmLabel: 'Delete',
              tone: 'danger',
            });
            if (!didConfirm) { return false; }
            return deleteMediaTagGloballyAction(tag, path);
          },
        }],
      }] : [])]}
    />
  );
}
