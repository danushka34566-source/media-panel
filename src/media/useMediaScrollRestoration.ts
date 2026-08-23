'use client';

import { useEffect } from 'react';

const STORAGE_PREFIX = 'media-panel:scroll:';
const RESTORE_TIMEOUT_MS = 12_000;
const RESTORE_INTERVAL_MS = 120;

const getStorageKey = () => {
  if (typeof window === 'undefined') { return undefined; }
  return `${STORAGE_PREFIX}${window.location.pathname}${window.location.search}`;
};

const saveScrollPosition = (key: string) => {
  try {
    window.sessionStorage.setItem(key, String(Math.max(0, Math.round(window.scrollY))));
  } catch {
    // Session storage can be unavailable in privacy/restricted browser modes.
  }
};

export const rememberMediaScrollPosition = () => {
  if (typeof window === 'undefined') { return; }
  const key = getStorageKey();
  if (key) { saveScrollPosition(key); }
};

/**
 * Preserve a feed's position while opening a media detail route and returning
 * with the browser back button. Restoration is deliberately bounded and
 * incremental: infinite grids may need a few fetches before the original
 * height exists, so we keep nudging the scroll to the saved position while
 * the sentinel appends more cards. A user's first manual scroll cancels it.
 */
export default function useMediaScrollRestoration(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') { return; }
    const key = getStorageKey();
    if (!key) { return; }

    let savedPosition: number | undefined;
    try {
      const raw = window.sessionStorage.getItem(key);
      const parsed = raw === null ? NaN : Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) { savedPosition = parsed; }
    } catch {
      return;
    }

    let restoreTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let restoring = true;
    const startedAt = Date.now();

    const stopRestoring = () => {
      restoring = false;
      if (restoreTimer !== undefined) { window.clearTimeout(restoreTimer); }
      if (timeoutTimer !== undefined) { window.clearTimeout(timeoutTimer); }
      resizeObserver?.disconnect();
    };

    const restore = () => {
      if (!restoring || savedPosition === undefined) { return; }
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      // Set the largest reachable value first. This wakes an infinite-scroll
      // sentinel even when the original position is below the first page.
      window.scrollTo(0, Math.min(savedPosition, maxScroll));
      if (
        maxScroll >= savedPosition - 2 ||
        Date.now() - startedAt >= RESTORE_TIMEOUT_MS
      ) {
        stopRestoring();
        return;
      }
      restoreTimer = window.setTimeout(restore, RESTORE_INTERVAL_MS);
    };

    const onScroll = () => {
      if (restoring) {
        // Ignore the scroll event caused by our own restoration write.
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        if (savedPosition !== undefined &&
          Math.abs(window.scrollY - Math.min(savedPosition, maxScroll)) <= 2) {
          return;
        }
        stopRestoring();
      }
      saveScrollPosition(key);
    };

    const onPageHide = () => saveScrollPosition(key);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (restoring && restoreTimer === undefined) { restore(); }
      });
      resizeObserver.observe(document.documentElement);
    }
    const timeoutTimer = window.setTimeout(stopRestoring, RESTORE_TIMEOUT_MS);
    window.requestAnimationFrame(restore);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      stopRestoring();
    };
  }, [enabled]);
}
