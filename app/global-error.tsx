'use client';

import { HTML_LANG } from '@/app/config';
import HttpStatusPage from '@/components/HttpStatusPage';
import { TbRefresh } from 'react-icons/tb';
import '../tailwind.css';

export default function GlobalError({ reset, unstable_retry }: {
  reset: () => void
  unstable_retry?: () => void
}) {
  return (
    <html lang={HTML_LANG}>
      <body>
        <HttpStatusPage status={<TbRefresh />}>
          Something went wrong
          <div className="mt-3 flex justify-center gap-4">
            <button
              type="button"
              className="text-main"
              onClick={unstable_retry ?? reset}
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
      </body>
    </html>
  );
}
