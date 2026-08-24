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
 * Browser-native restoration handles reloads and the intercepted media route
 * keeps the feed mounted for detail navigation. This hook only performs one
 * exact correction once the saved card exists; it never walks the viewport
 * through a sequence of partially loaded positions.
 */
export default function useMediaScrollRestoration(enabled = true) {
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
    let userInterrupted = false;
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const stopRestoring = () => {
      restoring = false;
      if (timeoutTimer !== undefined) { window.clearTimeout(timeoutTimer); }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
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
          programmaticScroll = true;
          window.scrollTo({ top: target, behavior: 'auto' });
          window.requestAnimationFrame(() => { programmaticScroll = false; });
        }
        // Consume the one-shot card anchor after the exact layout position is
        // restored. Normal scrolling must write a numeric position again,
        // rather than repeatedly trying to find an old card on later visits.
        writePosition(key, { top: target });
        stopRestoring();
        return;
      }

      // If no card anchor was recorded (for example a plain refresh), correct
      // the numeric position once it is reachable. Until then leave native
      // browser restoration in control instead of repeatedly scrolling to the
      // bottom of each newly mounted infinite page.
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      if (!saved.anchorId && maxScroll >= saved.top - 2) {
        const target = saved.top;
        programmaticScroll = true;
        if (Math.abs(window.scrollY - target) > 2) {
          window.scrollTo({ top: target, behavior: 'auto' });
        }
        window.requestAnimationFrame(() => { programmaticScroll = false; });
        stopRestoring();
      }
    };

    const onScroll = () => {
      if (restoring || programmaticScroll) { return; }
      // A real scroll consumes any old click anchor. Refresh should restore
      // where the user most recently stopped, not the card they opened before
      // continuing to browse the feed.
      saveCurrentScrollPosition(key);
    };
    const onUserInteraction = () => {
      if (!restoring || programmaticScroll) { return; }
      userInterrupted = true;
      writePosition(key, { top: Math.max(0, Math.round(window.scrollY)) });
      stopRestoring();
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
    window.addEventListener('wheel', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });
    window.addEventListener('pointerdown', onUserInteraction, { passive: true });
    if (restoring && typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(restore);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (restoring && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(restore);
      resizeObserver.observe(document.documentElement);
    }
    if (restoring) {
      // The layout effect runs before paint. In the common case the server
      // rendered card already exists, so this correction is invisible.
      restore();
      if (restoring && !userInterrupted) {
        window.requestAnimationFrame(restore);
      }
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('wheel', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      window.removeEventListener('pointerdown', onUserInteraction);
      stopRestoring();
    };
  }, [enabled]);
}
