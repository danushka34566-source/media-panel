'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

// Mobile Safari/Chrome can restore the document from a frozen compositor
// state while leaving the App Router tree mounted but visually blank. Keep
// this recovery at the root so it covers public, admin, and detail pages.
export default function PageResumeRecovery() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | undefined>(undefined);
  const recoveringRef = useRef(false);

  useEffect(() => {
    let recoveryTimer: number | undefined;
    let fallbackTimer: number | undefined;
    let resetTimer: number | undefined;

    const clearTimers = () => {
      if (recoveryTimer !== undefined) {
        window.clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }
      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
      }
      if (resetTimer !== undefined) {
        window.clearTimeout(resetTimer);
        resetTimer = undefined;
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
            // iOS can keep a stale composited layer after a tab resumes even
            // though the React tree still contains all of its content. A
            // short display toggle forces that layer to be rebuilt without
            // throwing away the current route or scroll position.
            const root = document.documentElement;
            root.style.display = 'none';
            void root.offsetHeight;
            root.style.display = '';
            window.dispatchEvent(new Event('resize'));
            const main = document.querySelector('main');
            const hasRenderedContent = Boolean(
              main && main.childElementCount > 0 &&
              main.getBoundingClientRect().height > 0,
            );
            // Do not refresh every route after a normal mobile resume. A
            // refresh recreates grid data and jumps the user to the top even
            // when the existing tree only needed a compositor repaint.
            // Refresh is reserved for a genuinely missing/empty route tree.
            if (!hasRenderedContent) {
              try {
                router.refresh();
              } catch {
                // A route can be tearing down at the same time; pageshow will
                // deliver another opportunity on the next resume.
              }
            }
            // If the App Router tree was discarded rather than merely stale,
            // fall back to one document reload. The guard prevents loops.
            fallbackTimer = window.setTimeout(() => {
              fallbackTimer = undefined;
              const currentMain = document.querySelector('main');
              if (
                !currentMain ||
                currentMain.childElementCount === 0 ||
                currentMain.getBoundingClientRect().height === 0
              ) {
                window.location.reload();
              }
              recoveringRef.current = false;
            }, 1_500);
          });
        });
      }, 120);

      // Keep the guard scoped to this resume event. A tab can be locked and
      // unlocked repeatedly; one successful recovery must not disable all
      // future recovery attempts for the lifetime of the page.
      resetTimer = window.setTimeout(() => {
        resetTimer = undefined;
        recoveringRef.current = false;
      }, 2_000);
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
