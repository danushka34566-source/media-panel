'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function MediaDetailScrollReset() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (typeof window === 'undefined') { return; }
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return () => { window.history.scrollRestoration = previous; };
  }, [pathname]);

  return null;
}
