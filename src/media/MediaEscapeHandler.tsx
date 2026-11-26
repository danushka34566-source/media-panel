'use client';

import { getEscapePath } from '@/app/path';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import useEscapeHandler from '../utility/useEscapeHandler';
import { goBackOrReplace } from '@/utility/back-navigation';

export default function MediaEscapeHandler() {
  const router = useRouter();
 
  const pathname = usePathname();

  const escapePath = getEscapePath(pathname);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (!escapePath || event.repeat || event.defaultPrevented ||
      document.fullscreenElement ||
      document.querySelector('[aria-modal="true"], [role="menu"], .viewer-in')) { return; }
    goBackOrReplace(router, escapePath);
  }, [escapePath, router]);

  useEscapeHandler({ onKeyDown });

  return null;
}
