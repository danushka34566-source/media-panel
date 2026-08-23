'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

// Mobile Safari/Chrome can restore the document from a frozen compositor
// state while leaving the App Router tree mounted but visually blank. Keep
// this recovery at the root so it covers public, admin, and detail pages.
export default function PageResumeRecovery() {
  const router = useRouter();
  const hiddenAtRef = useRef<number>();
  const recoveringRef = useRef(false);

  useEffect(() => {
    let recoveryTimer: number | undefined;
    let fallbackTimer: number | undefined;

    const clearTimers = () => {
      if (recoveryTimer !== undefined) {
        window.clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }
      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
      }
    };

    const recover = (force = false) => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtRef.current
        ? Date.now() - hiddenAtRef.current
        : 0;
      hiddenAtRef.current = undefined;
      if (!force && hiddenFor < 500) { return; }
      if (recoveringRef.current) { return; }
      recoveringRef.current = true;
      clearTimers();

      // Let the browser restore its viewport/compositor before asking Next to
      // reconcile the RSC tree. This avoids refreshing into the same black
      // frame seen immediately after an iOS lock/unlock transition.
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = undefined;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              router.refresh();
            } catch {
              // A route can be tearing down at the same time; pageshow will
              // deliver another opportunity on the next resume.
            }
            // If the App Router tree was discarded rather than merely stale,
            // fall back to one document reload. The guard prevents loops.
            fallbackTimer = window.setTimeout(() => {
              fallbackTimer = undefined;
              const main = document.querySelector('main');
              if (!main || !main.textContent?.trim()) {
                window.location.reload();
              }
            }, 1_500);
          });
        });
      }, 120);
    };

    const onVisibilityChange = () => recover();
    const onPageShow = (event: PageTransitionEvent) => recover(event.persisted);
    const onResume = () => recover(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('resume', onResume);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('resume', onResume);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [router]);

  return null;
}
