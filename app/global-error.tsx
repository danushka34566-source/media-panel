'use client';

import HttpStatusPage from '@/components/HttpStatusPage';
import { TbRefresh } from 'react-icons/tb';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <HttpStatusPage status={<TbRefresh />}>
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
