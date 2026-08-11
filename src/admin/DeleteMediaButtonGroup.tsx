'use client';

import LoaderButton from '@/components/primitives/LoaderButton';
import { photoQuantityText } from '@/media';
import { deleteMediaItemsAction } from '@/media/actions';
import { useAppState } from '@/app/AppState';
import { toastSuccess, toastWarning } from '@/toast';
import { ComponentProps, useState } from 'react';
import DeleteButton from './DeleteButton';
import { useAppText } from '@/i18n/state/client';

const DELETION_WAIT_TIMEOUT_MS = 2 * 60 * 1000;

const waitForMediaDeletion = async (mediaIds: string[]) => {
  const deadline = Date.now() + DELETION_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch('/api/media/deletion-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaIds }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string
      items?: Array<{ status?: string, error?: string }>
    };
    if (!response.ok) {
      throw new Error(data.error || 'Unable to check deletion progress');
    }
    const items = data.items || [];
    const failed = items.find(item => item.status === 'failed');
    if (failed) {
      throw new Error(failed.error || 'Backend deletion failed');
    }
    if (
      items.length === mediaIds.length &&
      items.every(item => item.status === 'completed')
    ) {
      return true;
    }
    await new Promise(resolve => window.setTimeout(resolve, 1_000));
  }
  return false;
};

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
          .then(async () => {
            const completed = await waitForMediaDeletion(photoIds);
            toastSuccess(toastText ?? (completed
              ? `${photosText} deleted`
              : `${photosText} queued; cleanup is still running`));
            if (clearLocalState) {
              invalidateSwr?.();
              registerAdminUpdate?.();
            }
            onDelete?.();
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
