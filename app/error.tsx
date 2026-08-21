'use client';

import HttpStatusPage from '@/components/HttpStatusPage';
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

  useEffect(() => {
    if (recoveredRef.current || !isStaleClientError(error)) { return; }
    recoveredRef.current = true;
    // A tab resumed after a deployment can hold old route chunks. A document
    // reload obtains one consistent build instead of leaving the user at a
    // dead error screen. Only do this once; real errors remain retryable.
    window.location.reload();
  }, [error]);

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
