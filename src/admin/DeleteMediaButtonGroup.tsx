'use client';

import LoaderButton from '@/components/primitives/LoaderButton';
import { photoQuantityText } from '@/media';
import { deleteMediaItemsAction } from '@/media/actions';
import { useAppState } from '@/app/AppState';
import { toastSuccess, toastWarning } from '@/toast';
import { ComponentProps, useState } from 'react';
import DeleteButton from './DeleteButton';
import { useAppText } from '@/i18n/state/client';
import { monitorMediaDeletion } from './deletion-progress';

export default function DeleteMediaButtonGroup({
  photoIds = [],
  onDelete,
  clearLocalState = true,
  onClick,
  onFinish,
  confirmText,
  toastText,
  ...rest
}: {
  photoIds?: string[]
  onClick?: () => void
  onFinish?: () => void
  onDelete?: () => void
  clearLocalState?: boolean
  toastText?: string
} & ComponentProps<typeof LoaderButton>) {
  const [isLoading, setIsLoading] = useState(false);

  const appText = useAppText();

  const photosText = photoQuantityText(photoIds.length, appText, false, false);

  const { canDelete, invalidateSwr, registerAdminUpdate } = useAppState();

  if (!canDelete) { return null; }

  return (
    <DeleteButton
      {...rest}
      isLoading={isLoading}
      // eslint-disable-next-line max-len
      confirmText={confirmText ?? `Are you sure you want to delete ${photosText}? This action cannot be undone.`}
      onClick={() => {
        onClick?.();
        setIsLoading(true);
        deleteMediaItemsAction(photoIds)
          .then(() => {
            toastSuccess(`${photosText} added to delete queue`);
            if (clearLocalState) {
              invalidateSwr?.();
              registerAdminUpdate?.();
            }
            onDelete?.();
            void monitorMediaDeletion(
              photoIds,
              toastText ?? `${photosText} deleted`,
            );
          })
          .catch(error => toastWarning(
            error instanceof Error
              ? error.message
              : `Failed to delete ${photosText}`,
          ))
          .finally(() => {
            setIsLoading(false);
            onFinish?.();
          });
      }}
    />
  );
}
