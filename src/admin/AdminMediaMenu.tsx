'use client';

import { ComponentProps, useMemo, useState } from 'react';
import {
  getPathComponents,
  PATH_ROOT,
  pathForAdminMediaEdit,
  pathForTag,
} from '@/app/path';
import {
  deleteMediaAction,
  syncMediaAction,
  toggleFavoriteMediaAction,
  togglePrivateMediaAction,
} from '@/media/actions';
import {
  Media,
  deleteConfirmationTextForMedia,
  downloadFileNameForMedia,
} from '@/media';
import { isPathFavs, isMediaFav, TAG_PRIVATE } from '@/tag';
import { usePathname, useRouter } from 'next/navigation';
import MoreMenu, { MoreMenuSection } from '@/components/more/MoreMenu';
import { useAppState } from '@/app/AppState';
import { RevalidateMedia } from '@/media/InfiniteMediaScroll';
import { MdOutlineFileDownload } from 'react-icons/md';
import MoreMenuItem from '@/components/more/MoreMenuItem';
import IconGrSync from '@/components/icons/IconGrSync';
import InsightsIndicatorDot from './insights/InsightsIndicatorDot';
import IconFavs from '@/components/icons/IconFavs';
import IconEdit from '@/components/icons/IconEdit';
import { photoNeedsToBeUpdated } from '@/media/update';
import { KEY_COMMANDS } from '@/media/key-commands';
import { useAppText } from '@/i18n/state/client';
import IconLock from '@/components/icons/IconLock';
import IconTrash from '@/components/icons/IconTrash';
import IconTag from '@/components/icons/IconTag';
import AdminMediaQuickEditModal from './AdminMediaQuickEditModal';
import useKeydownHandler from '@/utility/useKeydownHandler';
import { monitorMediaDeletion } from './deletion-progress';
import { toastSuccess } from '@/toast';

export default function AdminMediaMenu({
  photo,
  revalidateMedia,
  includeFavorite = true,
  showKeyCommands,
  ...props
}: Omit<ComponentProps<typeof MoreMenu>, 'sections'> & {
  photo: Media
  revalidateMedia?: RevalidateMedia
  includeFavorite?: boolean
  showKeyCommands?: boolean
}) {
  const {
    canDelete,
    canEdit,
    confirmDialog,
    registerAdminUpdate,
  } = useAppState();
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);

  useKeydownHandler({
    keys: [KEY_COMMANDS.quickEdit],
    onKeyDown: event => {
      if (event.metaKey || !canEdit) { return; }
      setIsQuickEditOpen(true);
    },
  });

  const appText = useAppText();

  const path = usePathname();
  const router = useRouter();
  const pathComponents = getPathComponents(path);
  const isOnMediaDetail = pathComponents.photoId === photo.id;
  const isFav = isMediaFav(photo);
  const shouldRedirectFav = isPathFavs(path) && isFav;
  const shouldRedirectDelete = isOnMediaDetail;
  const redirectPathOnPrivateToggle = isOnMediaDetail
    ? photo.hidden
      ? pathForTag(TAG_PRIVATE)
      : PATH_ROOT
    : undefined;

  const sectionMain = useMemo(() => {
    const items: ComponentProps<typeof MoreMenuItem>[] = [{
      label: appText.admin.edit,
      icon: <IconEdit
        size={14}
        className="translate-x-[0.5px] translate-y-[0.5px]"
      />,
      href: pathForAdminMediaEdit(photo.id, path),
      ...showKeyCommands && { keyCommand: KEY_COMMANDS.edit },
    }, {
      label: appText.admin.quickEdit,
      icon: <IconTag
        size={16}
        className="translate-x-[-1px] translate-y-[0.5px]"
      />,
      ...showKeyCommands && { keyCommand: KEY_COMMANDS.quickEdit },
      action: () => setIsQuickEditOpen(true),
    }];
    if (includeFavorite) {
      items.push({
        label: isFav ? appText.admin.unfavorite : appText.admin.favorite,
        icon: <IconFavs
          size={14}
          className="translate-x-[-1px] translate-y-[0.5px]"
          highlight={isFav}
        />,
        action: () => toggleFavoriteMediaAction(
          photo.id,
          shouldRedirectFav,
        ).then(() => revalidateMedia?.(photo.id)),
        ...showKeyCommands && {
          keyCommand: isFav
            ? KEY_COMMANDS.unfavorite
            : KEY_COMMANDS.favorite,
        },
      });
    }
    items.push({
      label: photo.hidden ? appText.admin.public : appText.admin.private,
      icon: <IconLock
        size={16}
        className="translate-x-[-1.5px] translate-y-[0.5px]"
        open={!photo.hidden}
        narrow
      />,
      action: () => togglePrivateMediaAction(
        photo.id,
        redirectPathOnPrivateToggle,
      )
        .then(() => revalidateMedia?.(photo.id)),
      ...showKeyCommands && {
        keyCommand: KEY_COMMANDS.togglePrivate,
      },
    });
    items.push({
      label: appText.admin.download,
      icon: <MdOutlineFileDownload
        size={17}
        className="translate-x-[-1px]"
      />,
      href: photo.url,
      hrefDownloadName: downloadFileNameForMedia(photo),
      ...showKeyCommands && { keyCommand: KEY_COMMANDS.download },
    });
    items.push({
      label: appText.admin.sync,
      labelComplex: <span className="inline-flex items-center gap-2">
        <span>{appText.admin.sync}</span>
        {photoNeedsToBeUpdated(photo) &&
          <InsightsIndicatorDot
            colorOverride="blue"
            className="ml-1 translate-y-[1.5px]"
            size="small"
          />}
      </span>,
      icon: <IconGrSync
        className="translate-x-[-1px] translate-y-[0.5px]"
      />,
      action: () => syncMediaAction(photo.id)
        .then(() => revalidateMedia?.(photo.id)),
      ...showKeyCommands && { keyCommand: KEY_COMMANDS.sync },
    });

    return { items };
  }, [
    appText,
    photo,
    showKeyCommands,
    includeFavorite,
    isFav,
    shouldRedirectFav,
    redirectPathOnPrivateToggle,
    path,
    revalidateMedia,
    setIsQuickEditOpen,
  ]);

  const sectionDelete: MoreMenuSection = useMemo(() => ({
    items: [{
      label: appText.admin.delete,
      icon: <IconTrash
        className="translate-x-[-1px]"
      />,
      className: 'text-error *:hover:text-error',
      color: 'red',
      action: async () => {
        const didConfirm = await confirmDialog?.({
          description: deleteConfirmationTextForMedia(photo, appText),
          confirmLabel: appText.admin.delete,
          tone: 'danger',
        });
        if (!didConfirm) { return false; }
        // Direct server-action redirects do not settle reliably from inside a
        // Radix menu item. Finish the action first, then navigate explicitly
        // so the menu can clean up and the detail page cannot remain mounted.
        return deleteMediaAction(photo.id, photo.url).then(async () => {
          await revalidateMedia?.(photo.id, true);
          registerAdminUpdate?.();
          toastSuccess(`"${photo.title || photo.id}" added to delete queue`);
          void monitorMediaDeletion(
            [photo.id],
            `"${photo.title || photo.id}" deleted`,
          );
          if (shouldRedirectDelete) {
            router.replace(PATH_ROOT, { scroll: false });
          }
        });
      },
      ...showKeyCommands && {
        keyCommandModifier: KEY_COMMANDS.delete[0],
        keyCommand: KEY_COMMANDS.delete[1],
      },
    }],
  }), [
    appText,
    photo,
    showKeyCommands,
    revalidateMedia,
    shouldRedirectDelete,
    registerAdminUpdate,
    router,
  ]);

  const sections = useMemo(() =>
    canDelete ? [sectionMain, sectionDelete] : [sectionMain]
  , [canDelete, sectionMain, sectionDelete]);

  return (
    canEdit
      ? <>
        <MoreMenu {...{
          ...props,
          sections,
        }}/>
        {isQuickEditOpen &&
          <AdminMediaQuickEditModal
            photo={photo}
            onClose={() => setIsQuickEditOpen(false)}
            onUpdated={() => revalidateMedia?.(photo.id)}
          />}
      </>
      : null
  );
}
