'use client';

import { useEffect } from 'react';

const STORAGE_PREFIX = 'media-panel:scroll:';
const RESTORE_TIMEOUT_MS = 12_000;

type SavedScrollPosition = {
  top: number
  anchorId?: string
  anchorOffset?: number
};

const getStorageKey = () => {
  if (typeof window === 'undefined') { return undefined; }
  return `${STORAGE_PREFIX}${window.location.pathname}${window.location.search}`;
};

const parseSavedPosition = (raw: string | null): SavedScrollPosition | undefined => {
  if (!raw) { return undefined; }
  try {
    const parsed = JSON.parse(raw) as Partial<SavedScrollPosition>;
    if (typeof parsed.top === 'number' && Number.isFinite(parsed.top)) {
      return {
        top: Math.max(0, parsed.top),
        anchorId: typeof parsed.anchorId === 'string'
          ? parsed.anchorId
          : undefined,
        anchorOffset: typeof parsed.anchorOffset === 'number' &&
          Number.isFinite(parsed.anchorOffset)
          ? parsed.anchorOffset
          : undefined,
      };
    }
  } catch {
    // Read the numeric format written by older versions.
    const legacy = Number(raw);
    if (Number.isFinite(legacy)) { return { top: Math.max(0, legacy) }; }
  }
  return undefined;
};

const writePosition = (key: string, position: SavedScrollPosition) => {
  try { window.sessionStorage.setItem(key, JSON.stringify(position)); } catch {
    // Session storage can be unavailable in privacy/restricted browser modes.
  }
};

const saveCurrentScrollPosition = (
  key: string,
  previous?: SavedScrollPosition,
) => writePosition(key, {
  top: Math.max(0, Math.round(window.scrollY)),
  ...(previous?.anchorId && { anchorId: previous.anchorId }),
  ...(previous?.anchorOffset !== undefined && {
    anchorOffset: previous.anchorOffset,
  }),
});

export const rememberMediaScrollPosition = (
  anchorId?: string,
  anchor?: HTMLElement,
) => {
  if (typeof window === 'undefined') { return; }
  const key = getStorageKey();
  if (!key) { return; }
  const rect = anchor?.getBoundingClientRect();
  writePosition(key, {
    top: Math.max(0, Math.round(window.scrollY)),
    ...(anchorId && { anchorId }),
    ...(rect && { anchorOffset: rect.top }),
  });
};

const findAnchor = (anchorId?: string) => {
  if (!anchorId) { return undefined; }
  return Array.from(document.querySelectorAll<HTMLElement>('[data-media-id]'))
    .find(element => element.dataset.mediaId === anchorId);
};

/**
 * Restore a feed by its clicked media card instead of repeatedly chasing a
 * pixel offset while infinite-scroll pages mount. The saved card is a stable
 * layout anchor; once it exists we correct the viewport once and stop. A
 * single initial nudge still wakes the infinite-scroll sentinel when the
 * saved card is below the first page.
 */
export default function useMediaScrollRestoration(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') { return; }
    const key = getStorageKey();
    if (!key) { return; }

    let saved: SavedScrollPosition | undefined;
    try {
      saved = parseSavedPosition(window.sessionStorage.getItem(key));
    } catch { return; }
    if (!saved || (saved.top <= 0 && !saved.anchorId)) { return; }

    let restoring = true;
    let programmaticScroll = false;
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const stopRestoring = () => {
      restoring = false;
      if (timeoutTimer !== undefined) { window.clearTimeout(timeoutTimer); }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.history.scrollRestoration = previousScrollRestoration;
    };

    const restore = () => {
      if (!restoring || !saved) { return; }
      const anchor = findAnchor(saved.anchorId);
      if (anchor) {
        const offset = saved.anchorOffset ?? 0;
        const target = Math.max(
          0,
          Math.round(window.scrollY + anchor.getBoundingClientRect().top - offset),
        );
        if (Math.abs(window.scrollY - target) > 2) {
          programmaticScroll = true;
          window.scrollTo({ top: target, behavior: 'auto' });
          window.setTimeout(() => { programmaticScroll = false; }, 250);
        }
        stopRestoring();
        return;
      }

      // Move to the largest reachable position once to activate the existing
      // infinite-scroll sentinel. Observers retry only after actual layout or
      // DOM growth, not on a timer every 120ms.
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const target = Math.min(saved.top, maxScroll);
      if (Math.abs(window.scrollY - target) > 2) {
        programmaticScroll = true;
        window.scrollTo({ top: target, behavior: 'auto' });
        window.setTimeout(() => { programmaticScroll = false; }, 250);
      }
      if (!saved.anchorId && maxScroll >= saved.top - 2) {
        stopRestoring();
      }
    };

    const onScroll = () => {
      if (restoring && !programmaticScroll) {
        // A real user gesture should take control immediately. The synthetic
        // scroll generated by restore() is ignored for this decision.
        stopRestoring();
      }
      if (!restoring) { saveCurrentScrollPosition(key); }
    };
    const onPageHide = () => {
      // A media click records the precise anchor immediately before the
      // route starts unloading. Do not overwrite that richer record with a
      // pagehide callback that still has the previous hook snapshot.
      let latest: SavedScrollPosition | undefined;
      try {
        latest = parseSavedPosition(window.sessionStorage.getItem(key));
      } catch { /* continue with the in-memory position */ }
      if (latest?.anchorId) { return; }
      saveCurrentScrollPosition(key, saved);
    };

    const timeoutTimer = window.setTimeout(stopRestoring, RESTORE_TIMEOUT_MS);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide, { passive: true });
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(restore);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(restore);
      resizeObserver.observe(document.documentElement);
    }
    window.requestAnimationFrame(restore);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      stopRestoring();
    };
  }, [enabled]);
}
