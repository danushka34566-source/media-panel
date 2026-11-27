'use client';

import HttpStatusPage from '@/components/HttpStatusPage';
import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect } from 'react';
import {
  currentHistoryKey,
  ensureLegacyHistoryTracking,
  subscribeToHistoryEntryChanges,
} from '@/utility/back-navigation';

const isStaleClientError = (error: Error) =>
  /chunkload|loading chunk|dynamically imported module|failed to fetch.*rsc|rsc.*fetch/i
    .test(`${error.name}: ${error.message}`);

const getRecoveryEntry = () => `${currentHistoryKey() ?? ''}:${location.href}`;
let recoveryEntry: string | undefined;
let stopTrackingRecoveryEntry: (() => void) | undefined;

function claimAutomaticRecovery() {
  ensureLegacyHistoryTracking();
  const entry = getRecoveryEntry();
  if (entry === recoveryEntry) { return false; }

  stopTrackingRecoveryEntry?.();
  recoveryEntry = entry;
  // Keep the guard alive when a retry remounts this fallback.
  stopTrackingRecoveryEntry = subscribeToHistoryEntryChanges(() => {
    if (getRecoveryEntry() === entry) { return; }
    recoveryEntry = undefined;
    stopTrackingRecoveryEntry?.();
    stopTrackingRecoveryEntry = undefined;
  });
  return true;
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter();
  const retry = useCallback(() => startTransition(() => {
    router.refresh();
    reset();
  }), [reset, router]);

  useEffect(() => {
    if (isStaleClientError(error) && claimAutomaticRecovery()) { retry(); }
  }, [error, retry]);

  return (
    <HttpStatusPage status={500}>
      Something went wrong
      <div className="mt-3 flex justify-center gap-4">
        <button
          type="button"
          className="text-main"
          onClick={retry}
        >
          Try again
        </button>
        <button
          type="button"
          className="text-main"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    </HttpStatusPage>
  );
}
