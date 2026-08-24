'use client';

import { useEffect, useLayoutEffect } from 'react';

const useMediaLayoutEffect = typeof window === 'undefined'
  ? useEffect
  : useLayoutEffect;

const STORAGE_PREFIX = 'media-panel:scroll:';
const RESTORE_TIMEOUT_MS = 4_000;

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

// Framer Motion transforms the visual card wrapper during the entrance
// animation. offsetTop/offsetParent describe the stable layout position and
// therefore keep the saved anchor from drifting when a user clicks mid-entry.
const getLayoutTop = (element: HTMLElement) => {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
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
  const anchorOffset = anchor
    ? getLayoutTop(anchor) - window.scrollY
    : undefined;
  writePosition(key, {
    top: Math.max(0, Math.round(window.scrollY)),
    ...(anchorId && { anchorId }),
    ...(anchorOffset !== undefined
      ? { anchorOffset }
      : rect && { anchorOffset: rect.top }),
  });
};

const findAnchor = (anchorId?: string) => {
  if (!anchorId) { return undefined; }
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>('[data-media-id]'),
  ).filter(element => element.dataset.mediaId === anchorId);
  return matches.find(element =>
    element.closest('[data-media-smart-preview-card]')) ?? matches[0];
};

export type MediaViewportAnchor = {
  mediaId: string
  viewportTop: number
};

export const captureMediaViewportAnchor = (): MediaViewportAnchor | undefined => {
  const headerBottom = document.querySelector<HTMLElement>('[data-site-header]')
    ?.getBoundingClientRect().bottom ?? 0;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-media-smart-preview-card] [data-media-id]',
    ),
  ).filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40 &&
      rect.bottom > headerBottom && rect.top < window.innerHeight;
  });
  const anchor = candidates.sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    return Math.abs(rectA.top - headerBottom) -
      Math.abs(rectB.top - headerBottom);
  })[0];
  const mediaId = anchor?.dataset.mediaId;
  return anchor && mediaId
    ? { mediaId, viewportTop: getLayoutTop(anchor) - window.scrollY }
    : undefined;
};

export const restoreMediaViewportAnchor = (anchor?: MediaViewportAnchor) => {
  if (!anchor) { return; }
  const element = findAnchor(anchor.mediaId);
  if (!element) { return; }
  // Ignore Framer Motion's temporary FLIP transform and measure the committed
  // grid layout. Otherwise the first animation frame can appear correct and
  // then drift away from the user's card as the transform settles.
  const delta = getLayoutTop(element) - window.scrollY - anchor.viewportTop;
  if (Math.abs(delta) > 0.5) { window.scrollBy({ top: delta, behavior: 'auto' }); }
};

/**
 * Restore a feed by its clicked media card instead of repeatedly chasing a
 * pixel offset while infinite-scroll pages mount. The saved card is a stable
 * layout anchor; once it exists we correct the viewport once and stop. A
 * single initial nudge still wakes the infinite-scroll sentinel when the
 * saved card is below the first page.
 */
export default function useMediaScrollRestoration(enabled = true) {
  // Restore before the browser paints the remounted feed.  useEffect lets the
  // new route render at scrollTop 0 for one frame, which is especially visible
  // when returning from a detail page; the subsequent correction then looks
  // like an unwanted auto-scroll.  The feed is already server-rendered when
  // this hook runs, so the layout effect can restore the stable card anchor
  // synchronously and still retain the observers for delayed infinite rows.
  useMediaLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') { return; }
    const key = getStorageKey();
    if (!key) { return; }

    let saved: SavedScrollPosition | undefined;
    try {
      saved = parseSavedPosition(window.sessionStorage.getItem(key));
    } catch { return; }
    let restoring = Boolean(saved && (saved.top > 0 || saved.anchorId));
    let programmaticScroll = false;
    let lastProgrammaticTarget: number | undefined;
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const previousScrollRestoration = window.history.scrollRestoration;
    const root = document.documentElement;
    const previousRootVisibility = root.style.visibility;
    if (restoring) {
      window.history.scrollRestoration = 'manual';
      // A returning infinite feed may not have mounted the saved card yet.
      // Keep that intermediate, clamped scroll position out of the paint so
      // the user never sees the page jump through several partial positions.
      root.style.visibility = 'hidden';
    }

    const stopRestoring = () => {
      restoring = false;
      if (timeoutTimer !== undefined) { window.clearTimeout(timeoutTimer); }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.history.scrollRestoration = previousScrollRestoration;
      root.style.visibility = previousRootVisibility;
      lastProgrammaticTarget = undefined;
    };

    const restore = () => {
      if (!restoring || !saved) { return; }
      const anchor = findAnchor(saved.anchorId);
      if (anchor) {
        const offset = saved.anchorOffset ?? 0;
        // Use the same transform-independent layout coordinate captured at
        // click time. Reading getBoundingClientRect here while the grid
        // entrance is still moving would stop restoration at a transient
        // position and then visibly drift when Framer settles.
        const target = Math.max(0, Math.round(getLayoutTop(anchor) - offset));
        if (Math.abs(window.scrollY - target) > 2) {
          lastProgrammaticTarget = target;
          programmaticScroll = true;
          window.scrollTo({ top: target, behavior: 'auto' });
          window.setTimeout(() => { programmaticScroll = false; }, 250);
        }
        // Consume the one-shot card anchor after the exact layout position is
        // restored. Normal scrolling must write a numeric position again,
        // rather than repeatedly trying to find an old card on later visits.
        writePosition(key, { top: target });
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
        lastProgrammaticTarget = target;
        programmaticScroll = true;
        window.scrollTo({ top: target, behavior: 'auto' });
        window.setTimeout(() => { programmaticScroll = false; }, 250);
      }
      if (!saved.anchorId && maxScroll >= saved.top - 2) {
        stopRestoring();
      }
    };

    const onScroll = () => {
      if (
        restoring &&
        !programmaticScroll &&
        lastProgrammaticTarget !== undefined &&
        Math.abs(window.scrollY - lastProgrammaticTarget) <= 2
      ) { return; }
      if (restoring && !programmaticScroll) {
        // A real user gesture should take control immediately. The synthetic
        // scroll generated by restore() is ignored for this decision.
        try {
          const stored = parseSavedPosition(window.sessionStorage.getItem(key));
          if (stored?.anchorId) { writePosition(key, { top: window.scrollY }); }
        } catch { /* continue with the live scroll position */ }
        stopRestoring();
      }
      if (!restoring) {
        let previous: SavedScrollPosition | undefined;
        try {
          const stored = parseSavedPosition(window.sessionStorage.getItem(key));
          // Next's client navigation emits a scroll-to-zero event after the
          // card click. Preserve the richer anchor record written by the click
          // instead of replacing it with `{ top: 0 }` during that transition.
          if (stored?.anchorId) { previous = stored; }
        } catch { /* continue with the live scroll position */ }
        saveCurrentScrollPosition(key, previous);
      }
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

    const timeoutTimer = restoring
      ? window.setTimeout(stopRestoring, RESTORE_TIMEOUT_MS)
      : undefined;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide, { passive: true });
    if (restoring && typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(restore);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (restoring && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(restore);
      resizeObserver.observe(document.documentElement);
    }
    if (restoring) { window.requestAnimationFrame(restore); }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      stopRestoring();
    };
  }, [enabled]);
}
