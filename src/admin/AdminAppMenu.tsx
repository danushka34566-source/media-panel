'use client';

import {
  PATH_ADMIN_ALBUMS,
  PATH_ADMIN_CATEGORIES,
  PATH_ADMIN_CONFIGURATION,
  PATH_ADMIN_INSIGHTS,
  PATH_ADMIN_MEDIA,
  PATH_ADMIN_MEDIA_UPDATES,
  PATH_ADMIN_PROCESSING,
  PATH_ADMIN_RECIPES,
  PATH_ADMIN_TAGS,
  PATH_ADMIN_UPLOADS,
} from '@/app/path';
import { useAppState } from '@/app/AppState';
import { IoArrowDown, IoArrowUp } from 'react-icons/io5';
import { clsx } from 'clsx/lite';
import AdminAppInfoIcon from './AdminAppInfoIcon';
import { signOutAction } from '@/auth/actions';
import { ComponentProps, useMemo } from 'react';
import useIsKeyBeingPressed from '@/utility/useIsKeyBeingPressed';
import IconMedia from '@/components/icons/IconMedia';
import IconFolder from '@/components/icons/IconFolder';
import IconRecipe from '@/components/icons/IconRecipe';
import IconTag from '@/components/icons/IconTag';
import IconSignOut from '@/components/icons/IconSignOut';
import { IoMdCheckboxOutline } from 'react-icons/io';
import IconBroom from '@/components/icons/IconBroom';
import InsightsIndicatorDot from './insights/InsightsIndicatorDot';
import MoreMenuItem from '@/components/more/MoreMenuItem';
import { useAppText } from '@/i18n/state/client';
import SwitcherItemMenu from '@/components/switcher/SwitcherItemMenu';
import { MoreMenuSection } from '@/components/more/MoreMenu';
import { FiXSquare } from 'react-icons/fi';
import { useSelectMediaState } from './select/SelectMediaState';
import IconAlbum from '@/components/icons/IconAlbum';

export default function AdminAppMenu({
  isOpen,
  setIsOpen,
}: {
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
}) {
  const {
    photosCountTotal = 0,
    photosCountNeedSync = 0,
    uploadState: {
      clientUploads,
    },
    albumsCount = 0,
    categoriesCount = 0,
    tagsCount = 0,
    recipesCount = 0,
    clearAuthStateAndRedirectIfNecessary,
    canManageConfiguration,
  } = useAppState();

  const {
    isSelectingMedia,
    startSelectingMedia,
    stopSelectingMedia,
  } = useSelectMediaState();

  const appText = useAppText();

  const isAltPressed = useIsKeyBeingPressed('alt');

  const showAppInsightsLink = photosCountTotal > 0 && !isAltPressed;
  const activeUploadCount = useMemo(() => clientUploads.filter(upload =>
    upload.status === 'queued' ||
    upload.status === 'uploading').length,
  [clientUploads]);

  const sectionMain: MoreMenuSection = useMemo(() => {
    const items: ComponentProps<typeof MoreMenuItem>[] = [];

    if (activeUploadCount) {
      items.push({
        label: appText.admin.uploadPlural,
        annotation: `${activeUploadCount}`,
        icon: <IconFolder
          size={15}
          className="translate-x-[0.5px] translate-y-[0.5px]"
        />,
        href: PATH_ADMIN_UPLOADS,
      });
    }
    items.push({
      label: 'Processing',
      icon: <IconBroom
        size={18}
        className="translate-y-[-0.5px]"
      />,
      href: PATH_ADMIN_PROCESSING,
    });
    if (photosCountNeedSync) {
      items.push({
        label: appText.admin.updatePlural,
        annotation: <>
          <span className="mr-3 text-blue-500">
            {photosCountNeedSync}
          </span>
          <InsightsIndicatorDot
            className="inline-block translate-y-[-1px]"
            colorOverride="blue"
            size="small"
          />
        </>,
        icon: <IconBroom
          size={18}
          className="translate-y-[-0.5px]"
        />,
        href: PATH_ADMIN_MEDIA_UPDATES,
      });
    }
    items.push({
      label: appText.admin.manageMedia,
      icon: <IconMedia
        size={15}
        className="translate-x-[-0.5px] translate-y-[0.5px]"
      />,
      href: PATH_ADMIN_MEDIA,
    });
    if (albumsCount) {
      items.push({
        label: appText.admin.manageAlbums,
        annotation: `${albumsCount}`,
        icon: <IconAlbum
          size={15}
          className="translate-x-[-0.5px] translate-y-[0.5px]"
        />,
        href: PATH_ADMIN_ALBUMS,
      });
    }
    if (categoriesCount) {
      items.push({
        label: 'Manage Categories',
        annotation: `${categoriesCount}`,
        icon: <IconTag
          size={15}
          className="translate-y-[1.5px]"
        />,
        href: PATH_ADMIN_CATEGORIES,
      });
    }
    if (tagsCount) {
      items.push({
        label: appText.admin.manageTags,
        annotation: `${tagsCount}`,
        icon: <IconTag
          size={15}
          className="translate-y-[1.5px]"
        />,
        href: PATH_ADMIN_TAGS,
      });
    }
    if (recipesCount) {
      items.push({
        label: appText.admin.manageRecipes,
        annotation: `${recipesCount}`,
        icon: <IconRecipe
          size={17}
          className="translate-x-[-0.5px]"
        />,
        href: PATH_ADMIN_RECIPES,
      });
    }
    if (photosCountTotal) {
      items.push({
        label: isSelectingMedia
          ? appText.admin.selectMediaExit
          : appText.admin.selectMedia,
        icon: isSelectingMedia
          ? <FiXSquare
            size={15}
            className="translate-x-[-0.75px] translate-y-[0.5px]"
          />
          : <IoMdCheckboxOutline
            size={16}
            className="translate-x-[-0.5px] translate-y-[0.5px]"
          />,
        action: isSelectingMedia
          ? stopSelectingMedia
          : startSelectingMedia,
      });
    }
    if (showAppInsightsLink || canManageConfiguration) {
      items.push({
        label: showAppInsightsLink
        ? appText.admin.appInsights
        : appText.admin.appConfig,
        icon: <AdminAppInfoIcon
          size="small"
          className="translate-x-[-0.5px]"
        />,
        href: showAppInsightsLink
          ? PATH_ADMIN_INSIGHTS
          : PATH_ADMIN_CONFIGURATION,
      });
    }

    return { items };
  }, [
    appText,
    activeUploadCount,
    isSelectingMedia,
    startSelectingMedia,
    stopSelectingMedia,
    photosCountNeedSync,
    photosCountTotal,
    recipesCount,
    showAppInsightsLink,
    canManageConfiguration,
    albumsCount,
    categoriesCount,
    tagsCount,
  ]);

  const sectionSignOut: MoreMenuSection = useMemo(() => ({
    items: [{
      label: appText.auth.signOut,
      icon: <IconSignOut size={15} />,
      action: () => signOutAction().then(clearAuthStateAndRedirectIfNecessary),
    }],
  }), [appText.auth.signOut, clearAuthStateAndRedirectIfNecessary]);

  const sections = useMemo(() =>
    [sectionMain, sectionSignOut]
  , [sectionMain, sectionSignOut]);

  return (
    <>
      <SwitcherItemMenu
        {...{ isOpen, setIsOpen }}
        icon={<div className="w-[28px] h-[28px] overflow-hidden">
          <div className={clsx(
            'relative flex flex-col items-center justify-center gap-2',
            'translate-y-[-18px]',
          )}>
            <IoArrowDown size={16} className="shrink-0" />
            <IoArrowUp size={16} className="shrink-0" />
          </div>
        </div>}
        align="start"
        sideOffset={12}
        alignOffset={-84}
        sections={sections}
        ariaLabel="Admin Menu"
        classNameButtonOpen={clsx(
          '[&>*>*]:translate-y-[6px]',
          '[&>*>*]:duration-300',
        )}
      />
    </>
  );
}

