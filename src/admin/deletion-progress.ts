'use client';

import { toast } from 'sonner';
import { toastSuccess, toastWarning } from '@/toast';

const DELETION_MONITOR_TIMEOUT_MS = 2 * 60 * 1000;
const DELETION_POLL_INTERVAL_MS = 1_000;

type DeletionStatusItem = {
  mediaId: string
  status?: string
  error?: string
  title?: string
};

const sleep = (milliseconds: number) => new Promise(resolve => {
  window.setTimeout(resolve, milliseconds);
});

/**
 * Monitor the durable deletion queue without keeping the delete control in a
 * loading state. Queue acceptance is handled by the caller; this is only the
 * non-blocking progress notification that follows it.
 */
export const monitorMediaDeletion = async (
  mediaIds: string[],
  completionMessage: string,
) => {
  const ids = Array.from(new Set(mediaIds));
  if (ids.length === 0) { return; }

  const completedIds = new Set<string>();
  const failedIds = new Set<string>();
  const progressToastId = `media-deletion-${Date.now()}-${ids[0]}`;
  const deadline = Date.now() + DELETION_MONITOR_TIMEOUT_MS;

  try {
    while (Date.now() < deadline) {
      const response = await fetch('/api/media/deletion-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds: ids }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string
        items?: DeletionStatusItem[]
      };
      if (!response.ok) {
        throw new Error(data.error || 'Unable to check deletion progress');
      }

      for (const item of data.items || []) {
        if (item.status === 'failed' && !failedIds.has(item.mediaId)) {
          failedIds.add(item.mediaId);
          toastWarning(
            `Unable to delete ${item.title || 'a file'}${item.error
              ? `: ${item.error}`
              : ''}`,
            8_000,
          );
        }
        if (item.status === 'completed' && !completedIds.has(item.mediaId)) {
          completedIds.add(item.mediaId);
          toast(
            `Deleted ${item.title || 'file'} (${completedIds.size}/${ids.length})`,
            { id: progressToastId, duration: 5_000 },
          );
        }
      }

      if (completedIds.size + failedIds.size >= ids.length) {
        toast.dismiss(progressToastId);
        if (failedIds.size === 0) {
          toastSuccess(completionMessage);
        }
        return;
      }

      await sleep(DELETION_POLL_INTERVAL_MS);
    }

    toast.dismiss(progressToastId);
    toastSuccess(`${completionMessage}; cleanup is still running`, 6_000);
  } catch (error) {
    toast.dismiss(progressToastId);
    toastWarning(
      error instanceof Error
        ? error.message
        : 'Unable to check deletion progress',
      8_000,
    );
  }
};
