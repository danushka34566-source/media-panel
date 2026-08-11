'use client';

import { useCallback, useRef } from 'react';
import {
  Media,
  downloadFileNameForMedia,
  getNextMedia,
  getPreviousMedia,
} from '@/media';
import { MediaSetCategory } from '../category';
import MediaLink from './MediaLink';
import { pathForAdminMediaEdit, pathForMedia } from '@/app/path';
import { useAppState } from '@/app/AppState';
import { AnimationConfig } from '@/components/AnimateItems';
import { clsx } from 'clsx/lite';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import useNavigateOrRunActionWithToast
  from '@/components/useNavigateOrRunActionWithToast';
import {
  deleteMediaAction,
  syncMediaAction,
  togglePrivateMediaAction,
} from './actions';
import Tooltip from '@/components/Tooltip';
import {
  ALLOW_PUBLIC_DOWNLOADS,
  SHOW_KEYBOARD_SHORTCUT_TOOLTIPS,
} from '@/app/config';
import { downloadFileFromBrowser } from '@/utility/url';
import useKeydownHandler from '@/utility/useKeydownHandler';
import { KEY_COMMANDS } from './key-commands';
import { syncMediaConfirmText } from '@/admin/confirm';
import { useAppText } from '@/i18n/state/client';
import usePersonalFavorite from '@/auth/usePersonalFavorite';

const ANIMATION_LEFT: AnimationConfig = { type: 'left', duration: 0.3 };
const ANIMATION_RIGHT: AnimationConfig = { type: 'right', duration: 0.3 };

export default function MediaPrevNextActions({
  photo,
  photos = [],
  className,
  hasAiTextGeneration,
  ...categories
}: {
  photo?: Media
  photos?: Media[]
  className?: string
  hasAiTextGeneration: boolean
} & MediaSetCategory) {
  const {
    canDelete,
    canEdit,
    confirmDialog,
    setNextMediaAnimation,
    isUserSignedIn,
  } = useAppState();

  const appText = useAppText();

  const photoTitle = photo
    ? photo.title
      ? `'${photo.title}'`
      : appText.photo.photo.toLocaleLowerCase()
    : undefined;
  const downloadUrl = photo?.url;
  const downloadFileName = photo
    ? downloadFileNameForMedia(photo)
    : undefined;

  const {
    isFavorite: isPersonalFavorite,
    toggle: toggleFavorite,
  } = usePersonalFavorite(photo?.id);

  const toggleHidden = useCallback(() => {
    if (photo?.id) { return togglePrivateMediaAction(photo.id); }
  }, [photo]);

  const navigateToMediaEdit = useNavigateOrRunActionWithToast({
    pathOrAction: photo ? pathForAdminMediaEdit(photo) : undefined,
    toastMessage: `Editing ${photoTitle} ...`,
  });

  const hideMedia = useNavigateOrRunActionWithToast({
    pathOrAction: toggleHidden,
    toastMessage: `Hiding ${photoTitle} ...`,
  });

  const unhideMedia = useNavigateOrRunActionWithToast({
    pathOrAction: toggleHidden,
    toastMessage: `Unhiding ${photoTitle} ...`,
  });

  const syncMedia = useNavigateOrRunActionWithToast({
    pathOrAction: useCallback(() => {
      if (photo?.id) { return syncMediaAction(photo.id); }
    }, [photo]),
    toastMessage: `Syncing ${photoTitle} ...`,
  });

  const deleteMedia = useNavigateOrRunActionWithToast({
    pathOrAction: useCallback(() => {
      if (photo?.id && photo.url) {
        return deleteMediaAction(photo.id, photo.url, true);
      }
    }, [photo]),
    toastMessage: `Queueing ${photoTitle} for deletion ...`,
  });

  const refPrevious = useRef<HTMLAnchorElement | null>(null);
  const refNext = useRef<HTMLAnchorElement | null>(null);

  const previousMedia = photo ? getPreviousMedia(photo, photos) : undefined;
  const nextMedia = photo ? getNextMedia(photo, photos) : undefined;

  const pathPrevious = previousMedia
    ? pathForMedia({ photo: previousMedia, ...categories })
    : undefined;

  const pathNext = nextMedia
    ? pathForMedia({ photo: nextMedia, ...categories })
    : undefined;

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.metaKey) {
      switch (e.key.toUpperCase()) {
        case KEY_COMMANDS.delete[1]:
          if (canDelete) {
            deleteMedia();
          }
          break;
      }
    } else {
      switch (e.key.toUpperCase()) {
      // Public commands
        case KEY_COMMANDS.prev[0]:
        case KEY_COMMANDS.prev[1]:
          if (pathPrevious) {
            setNextMediaAnimation?.(ANIMATION_RIGHT);
            refPrevious.current?.click();
          }
          break;
        case KEY_COMMANDS.next[0]:
        case KEY_COMMANDS.next[1]:
          if (pathNext) {
            setNextMediaAnimation?.(ANIMATION_LEFT);
            refNext.current?.click();
          }
          break;
          // Admin commands
        case KEY_COMMANDS.edit:
          if (canEdit) {
            navigateToMediaEdit();
          }
          break;
        case KEY_COMMANDS.favorite:
          if (isUserSignedIn && photo && !isPersonalFavorite) {
            void toggleFavorite();
          }
          break;
        case KEY_COMMANDS.unfavorite:
          if (isUserSignedIn && photo && isPersonalFavorite) {
            void toggleFavorite();
          }
          break;
        case KEY_COMMANDS.togglePrivate:
          if (canEdit && photo) {
            if (photo.hidden) {
              unhideMedia();
            } else {
              hideMedia();
            }
          }
          break;
        case KEY_COMMANDS.download:
          if (
            (isUserSignedIn || ALLOW_PUBLIC_DOWNLOADS) &&
          downloadUrl &&
          downloadFileName
          ) {
            downloadFileFromBrowser(downloadUrl, downloadFileName);
          }
          break;
        case KEY_COMMANDS.sync:
          if (canEdit && photo) {
            void confirmDialog?.({
              description: syncMediaConfirmText(photo, hasAiTextGeneration),
              confirmLabel: 'Sync',
              tone: 'danger',
            }).then(didConfirm => {
              if (didConfirm) {
                syncMedia();
              }
            });
          }
          break;
      };
    }
  }, [
    setNextMediaAnimation,
    pathPrevious,
    pathNext,
    isUserSignedIn,
    canDelete,
    canEdit,
    navigateToMediaEdit,
    photo,
    isPersonalFavorite,
    toggleFavorite,
    hideMedia,
    unhideMedia,
    downloadUrl,
    downloadFileName,
    syncMedia,
    deleteMedia,
    hasAiTextGeneration,
    confirmDialog,
  ]);
  useKeydownHandler({ onKeyDown });

  return (
    <div className={clsx(
      'flex items-center',
      className,
    )}>
      <div className={clsx(
        'h-4',
        'flex gap-2 select-none',
        // Fixes alignment issue when switching from chevrons to text
        'items-center sm:items-start',
        '*:select-none',
      )}>
        <Tooltip {...SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
          content: appText.nav.prev,
          keyCommand: KEY_COMMANDS.prev[0],
        }}>
          <MediaLink
            {...categories}
            ref={refPrevious}
            photo={previousMedia}
            nextMediaAnimation={ANIMATION_RIGHT}
            scroll={false}
            loaderType="badge"
            prefetch
          >
            <FiChevronLeft className="sm:hidden text-[1.1rem]" />
            <span className="hidden sm:inline-block uppercase">
              {appText.nav.prevShort}
            </span>
          </MediaLink>
        </Tooltip>
        <span className="text-extra-extra-dim">
          /
        </span>
        <Tooltip {...SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
          content: appText.nav.next,
          keyCommand: KEY_COMMANDS.next[0],
        }}>
          <MediaLink
            {...categories}
            ref={refNext}
            photo={nextMedia}
            nextMediaAnimation={ANIMATION_LEFT}
            scroll={false}
            loaderType="badge"
            prefetch
          >
            <FiChevronRight className="sm:hidden text-[1.1rem]" />
            <span className="hidden sm:inline-block uppercase">
              {appText.nav.nextShort}
            </span>
          </MediaLink>
        </Tooltip>
      </div>
    </div>
  );
};
