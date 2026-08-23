'use client';

import HttpStatusPage from '@/components/HttpStatusPage';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const isStaleClientError = (error: Error) =>
  /chunkload|loading chunk|dynamically imported module|failed to fetch.*rsc|rsc.*fetch/i
    .test(`${error.name}: ${error.message}`);

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const recoveredRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (recoveredRef.current || !isStaleClientError(error)) { return; }
    recoveredRef.current = true;
    // Refresh the App Router tree in place. A document reload loses the
    // user's scroll position and made transient RSC/chunk errors look like a
    // grid refresh loop. The explicit Reload button remains available when a
    // deployment really requires a new document.
    router.refresh();
  }, [error, router]);

  return (
    <HttpStatusPage status={500}>
      Something went wrong
      <div className="mt-3 flex justify-center gap-4">
        <button type="button" className="text-main" onClick={reset}>
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
