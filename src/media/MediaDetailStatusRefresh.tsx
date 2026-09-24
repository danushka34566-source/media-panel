'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Keep an already-open processing detail current after the worker finishes. */
export default function MediaDetailStatusRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') { router.refresh(); }
    };
    const interval = window.setInterval(refreshIfVisible, 30_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [router]);

  return null;
}
