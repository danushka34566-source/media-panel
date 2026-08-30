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
      // iOS may emit pageshow/focus without a preceding visibilitychange. The
      // pagehide/freeze handlers below seed hiddenAtRef for that path. Keep a
      // short hidden interval recorded until the next lifecycle event so a
      // duplicate early visibility event cannot consume the only recovery
      // signal.
      if (!force && hiddenAtRef.current === undefined) { return; }
      if (!force && hiddenFor < 500) { return; }
      hiddenAtRef.current = undefined;
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
            if (document.visibilityState === 'hidden') {
              recoveringRef.current = false;
              return;
            }
            const content = document.querySelector('[data-page-content]');
            const hasRenderedContent = Boolean(
              content && content.firstElementChild &&
              content.getBoundingClientRect().height > 0,
            );
            // DOM geometry can be healthy while iOS still presents a stale
            // black/white compositor layer. Nudge that layer with a tiny
            // compositor-only animation; unlike the old display toggle this
            // does not synchronously re-layout every image and video.
            if (hasRenderedContent) {
              const surface = document.body;
              if (typeof surface.animate === 'function') {
                const repaint = surface.animate([
                  { opacity: 0.999 },
                  { opacity: 1 },
                ], {
                  duration: 1,
                  iterations: 1,
                });
                void repaint.finished.then(
                  () => repaint.cancel(),
                  () => undefined,
                );
              }
              recoveringRef.current = false;
              return;
            }
            // iOS can keep a stale composited layer after a tab resumes even
            // though the React tree still contains all of its content. A
            // short display toggle forces that layer to be rebuilt without
            // throwing away the current route or scroll position.
            const root = document.documentElement;
            root.style.display = 'none';
            void root.offsetHeight;
            root.style.display = '';
            window.dispatchEvent(new Event('resize'));
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
              const currentContent = document.querySelector('[data-page-content]');
              if (
                !currentContent ||
                !currentContent.firstElementChild ||
                currentContent.getBoundingClientRect().height === 0
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
    const onPageHide = () => {
      hiddenAtRef.current = Date.now();
      recoveringRef.current = false;
      clearTimers();
    };
    const onPageShow = (event: PageTransitionEvent) =>
      recover(event.persisted || hiddenAtRef.current !== undefined);
    const onFreeze = () => onPageHide();
    const onFocus = () => {
      if (hiddenAtRef.current !== undefined) { recover(true); }
    };
    const onResume = () => recover(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('freeze', onFreeze);
    document.addEventListener('resume', onResume);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('freeze', onFreeze);
      document.removeEventListener('resume', onResume);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  }, [router]);

  return null;
}
