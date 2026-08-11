'use client';

import LoaderButton from '@/components/primitives/LoaderButton';
import { storeColorDataForMediaAction, syncMediaAction } from '@/media/actions';
import IconGrSync from '@/components/icons/IconGrSync';
import { toastSuccess } from '@/toast';
import { ComponentProps, useRef, useState } from 'react';
import Tooltip from '@/components/Tooltip';
import clsx from 'clsx/lite';
import useScrollIntoView from '@/utility/useScrollIntoView';
import { Media } from '@/media';
import { syncMediaConfirmText } from './confirm';
import { isMediaOnlyMissingColorData } from '@/media/update';
import { useAppState } from '@/app/AppState';

export default function MediaSyncButton({
  photo,
  onSyncComplete,
  updateMode,
  className,
  isSyncingExternal,
  hasAiTextGeneration,
  disabled,
  shouldConfirm,
  shouldToast,
  shouldScrollIntoViewOnExternalSync,
}: {
  photo: Media
  onSyncComplete?: () => void
  updateMode?: boolean
  isSyncingExternal?: boolean
  hasAiTextGeneration: boolean
  shouldConfirm?: boolean
  shouldToast?: boolean
  shouldScrollIntoViewOnExternalSync?: boolean
} & ComponentProps<typeof LoaderButton>) {
  const { confirmDialog } = useAppState();
  const ref = useRef<HTMLButtonElement>(null);

  const [isSyncing, setIsSyncing] = useState(false);

  useScrollIntoView({
    ref,
    shouldScrollIntoView:
      isSyncingExternal &&
      shouldScrollIntoViewOnExternalSync,
  });

  const onlySyncColorData = updateMode &&
    isMediaOnlyMissingColorData(photo);

  return (
    <Tooltip content={onlySyncColorData
      ? 'Update color data'
      : 'Regenerate photo data'}>
      <LoaderButton
        ref={ref}
        className={clsx(
          'scroll-mt-32',
          className,
        )}
        icon={<IconGrSync
          className="translate-y-[0.5px] translate-x-[0.5px]"
        />}
        onClick={async () => {
          if (shouldConfirm) {
            const didConfirm = await confirmDialog?.({
              description: syncMediaConfirmText(
                photo,
                hasAiTextGeneration,
                onlySyncColorData,
              ),
              confirmLabel: 'Sync',
              tone: 'danger',
            });
            if (!didConfirm) { return; }
          }
          setIsSyncing(true);
          (onlySyncColorData
            ? storeColorDataForMediaAction(photo.id)
            : syncMediaAction(photo.id, { updateMode }))
            .then(() => {
              onSyncComplete?.();
              if (shouldToast) {
                toastSuccess(photo.title
                  ? `"${photo.title}" data synced`
                  : 'Data synced');
              }
            })
            .finally(() => setIsSyncing(false));
        }}
        isLoading={isSyncing || isSyncingExternal}
        disabled={disabled}
      />
    </Tooltip>
  );
}
