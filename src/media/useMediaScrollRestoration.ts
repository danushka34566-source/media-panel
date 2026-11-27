'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { getMediaSearchQuery } from '@/app/path';
import {
  currentHistoryKey,
  ensureLegacyHistoryTracking,
  subscribeToHistoryEntryChanges,
} from '@/utility/back-navigation';

const useMediaLayoutEffect = typeof window === 'undefined'
  ? useEffect
  : useLayoutEffect;

const STORAGE_PREFIX = 'media-panel:scroll:';
const ANCHOR_REQUEST_EVENT = 'media-feed-restore-anchor';

type AnchorRequest = { routeKey: string, storageKey: string, anchorId: string };
let anchorRequest: AnchorRequest | undefined;

const publishAnchorRequest = (request?: AnchorRequest) => {
  anchorRequest = request;
  window.dispatchEvent(new Event(ANCHOR_REQUEST_EVENT));
};

const subscribeToAnchorRequests = (notify: () => void) => {
  window.addEventListener(ANCHOR_REQUEST_EVENT, notify);
  return () => window.removeEventListener(ANCHOR_REQUEST_EVENT, notify);
};

type SavedScrollPosition = {
  top: number
  anchorId?: string
  anchorOffset?: number
};

const getStorageKey = () => {
  if (typeof window === 'undefined') { return undefined; }
  const { pathname, search } = window.location;
  const entryKey = currentHistoryKey();
  return `${STORAGE_PREFIX}${pathname}${search}${entryKey ? '#' + entryKey : ''}`;
};

const parseSavedPosition = (raw: string | null): SavedScrollPosition | undefined => {
  if (!raw) { return undefined; }
  try {
    const parsed = JSON.parse(raw);
    // Older versions stored the pixel offset as a number.
    if (typeof parsed === 'number' && Number.isFinite(parsed)) {
      return { top: Math.max(0, parsed) };
    }
    if (parsed && typeof parsed.top === 'number' && Number.isFinite(parsed.top)) {
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
  } catch { /* Ignore damaged or incomplete snapshots. */ }
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
  const resolvedAnchor = anchor ?? findAnchor(anchorId);
  const anchorOffset = resolvedAnchor
    ? getLayoutTop(resolvedAnchor) - window.scrollY
    : undefined;
  writePosition(key, {
    top: Math.max(0, Math.round(window.scrollY)),
    ...(anchorId && { anchorId }),
    ...(anchorOffset !== undefined && { anchorOffset }),
  });
};

const findAnchor = (anchorId?: string) => {
  if (!anchorId) { return undefined; }
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>('[data-media-id]'),
  ).filter(element => element.dataset.mediaId === anchorId);
  return matches.find(element =>
    element.closest('[data-media-smart-preview-card]')) ??
    matches.find(element => element.tagName === 'A') ?? matches[0];
};

export const hasMediaScrollAnchor = (anchorId: string) => Boolean(findAnchor(anchorId));

export const useMediaFeedRestorationAnchor = (routeKey: string) =>
  useSyncExternalStore(
    subscribeToAnchorRequests,
    () => anchorRequest?.routeKey === routeKey &&
      anchorRequest.storageKey === getStorageKey()
      ? anchorRequest.anchorId
      : undefined,
    () => undefined,
  );

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
export default function useMediaScrollRestoration(
  routeKey?: string,
  resetAtStart = false,
  feedComplete = false,
  committedSearchQuery?: string,
) {
  const pathname = usePathname();
  const [restoredEntry, setRestoredEntry] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  // Restore before the browser paints the remounted feed.  useEffect lets the
  // new route render at scrollTop 0 for one frame, which is especially visible
  // when returning from a detail page; the subsequent correction then looks
  // like an unwanted auto-scroll.  The feed is already server-rendered when
  // this hook runs, so the layout effect can restore the stable card anchor
  // synchronously and still retain the observers for delayed infinite rows.
  useMediaLayoutEffect(() => {
    if (typeof window === 'undefined') { return; }
    const committedPathname = pathname ?? window.location.pathname;
    const matchesCommittedRoute = () =>
      window.location.pathname === committedPathname && (
        committedSearchQuery === undefined ||
        getMediaSearchQuery(new URLSearchParams(window.location.search)
          .get('query') ?? undefined) === committedSearchQuery
      );
    ensureLegacyHistoryTracking();
    const key = getStorageKey();
    if (!key) { return; }
    // A popstate URL can change before React replaces the prior search grid.
    // Its DOM must never satisfy or consume the incoming entry's anchor. Keep
    // a history listener while waiting so a rapid Back/Forward can re-arm this
    // effect even when the committed route itself does not change.
    if (!matchesCommittedRoute()) {
      let waiting = true;
      const unsubscribe = subscribeToHistoryEntryChanges(() => {
        if (waiting && matchesCommittedRoute()) {
          setHistoryRevision(revision => revision + 1);
        }
      });
      return () => {
        waiting = false;
        unsubscribe();
      };
    }
    let disposed = false;
    let leftEntry = false;
    const isCurrentEntry = () => !disposed && !leftEntry && key === getStorageKey();

    let saved: SavedScrollPosition | undefined;
    try {
      saved = parseSavedPosition(window.sessionStorage.getItem(key));
    } catch { /* Scroll still works when storage is disabled. */ }
    let restoring = Boolean(saved && (saved.top > 0 || saved.anchorId));
    // Keep returning grids settled for the lifetime of this route, including
    // rows that arrive after the initial scroll correction.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestoredEntry(restoring);
    if (resetAtStart && !saved?.anchorId && !saved?.top && window.scrollY) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let restoreTimeout: ReturnType<typeof setTimeout> | undefined;
    let requestedAnchor: AnchorRequest | undefined;
    let wasPageHidden = false;
    const previousScrollRestoration = window.history.scrollRestoration;
    const root = document.documentElement;
    if (restoring) {
      window.history.scrollRestoration = 'manual';
      // Keep the restoration state observable without hiding the document.
      // Hiding the root caused a several-second white flash while an infinite
      // feed mounted the saved card.
      root.dataset.mediaScrollRestoring = 'true';
    }

    const stopRestoring = () => {
      if (!restoring) { return; }
      restoring = false;
      if (restoreTimeout !== undefined) {
        clearTimeout(restoreTimeout);
        restoreTimeout = undefined;
      }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (requestedAnchor && anchorRequest === requestedAnchor) {
        publishAnchorRequest();
      }
      window.history.scrollRestoration = previousScrollRestoration;
      delete root.dataset.mediaScrollRestoring;
    };

    const restore = () => {
      if (!isCurrentEntry() || !restoring || !saved) { return; }
      const anchor = findAnchor(saved.anchorId);
      if (anchor) {
        const offset = saved.anchorOffset ?? 0;
        // Use the same transform-independent layout coordinate captured at
        // click time. Reading getBoundingClientRect here while the grid
        // entrance is still moving would stop restoration at a transient
        // position and then visibly drift when Framer settles.
        const target = Math.max(0, Math.round(getLayoutTop(anchor) - offset));
        if (Math.abs(window.scrollY - target) > 2) {
          window.scrollTo({ top: target, behavior: 'auto' });
        }
        // Consume the one-shot card anchor after the exact layout position is
        // restored. Normal scrolling must write a numeric position again,
        // rather than repeatedly trying to find an old card on later visits.
        writePosition(key, { top: target });
        stopRestoring();
        return;
      }

      // The old pixel position can be far above the sentinel on a taller
      // layout. Ask the matching feed to advance until the card mounts.
      if (routeKey && saved.anchorId && !feedComplete && !requestedAnchor) {
        requestedAnchor = { routeKey, storageKey: key, anchorId: saved.anchorId };
        publishAnchorRequest(requestedAnchor);
      }
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const target = Math.min(saved.top, maxScroll);
      if (Math.abs(window.scrollY - target) > 2) {
        window.scrollTo({ top: target, behavior: 'auto' });
      }
      if (!saved.anchorId && maxScroll >= saved.top - 2) {
        stopRestoring();
      }
    };

    const settleAtReachablePosition = () => {
      if (!isCurrentEntry() || !restoring || !saved) { return; }
      // The requested card may have been deleted or excluded from this feed.
      // Keep as much of the saved position as the now-complete layout allows,
      // then release the restored-grid animation state.
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const target = Math.min(saved.top, maxScroll);
      if (Math.abs(window.scrollY - target) > 2) {
        window.scrollTo({ top: target, behavior: 'auto' });
      }
      writePosition(key, { top: target });
      stopRestoring();
    };

    const onFeedExhausted = (event: Event) => {
      if (!isCurrentEntry()) { return; }
      const detail = (event as CustomEvent<{
        cacheKey?: string
        href?: string
      }>).detail;
      if (detail?.href !== window.location.href) { return; }
      if (routeKey && detail.cacheKey !== routeKey) { return; }
      restore();
      settleAtReachablePosition();
    };

    const onScroll = () => {
      // Browser history and Next navigation can both dispatch scroll events.
      // Neither proves the user moved away from the saved card; keep waiting
      // for its grid row until a real input event cancels restoration.
      if (restoring || !isCurrentEntry()) { return; }
      let previous: SavedScrollPosition | undefined;
      try {
        const stored = parseSavedPosition(window.sessionStorage.getItem(key));
        if (stored?.anchorId) { previous = stored; }
      } catch { /* continue with the live scroll position */ }
      saveCurrentScrollPosition(key, previous);
    };
    const cancelForUserInput = () => {
      if (!isCurrentEntry() || !restoring) { return; }
      writePosition(key, { top: Math.max(0, Math.round(window.scrollY)) });
      stopRestoring();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']
        .includes(event.key)) { cancelForUserInput(); }
    };
    const onPageHide = () => {
      if (!isCurrentEntry()) { return; }
      wasPageHidden = true;
      // A media click records the precise anchor immediately before the
      // route starts unloading. Do not overwrite that richer record with a
      // pagehide callback that still has the previous hook snapshot.
      let latest: SavedScrollPosition | undefined;
      try {
        latest = parseSavedPosition(window.sessionStorage.getItem(key));
      } catch { /* continue with the in-memory position */ }
      if (latest?.anchorId) { return; }
      saveCurrentScrollPosition(key);
    };

    const restoreAfterPageShow = () => {
      if (!isCurrentEntry() || !wasPageHidden || document.hidden) { return; }
      wasPageHidden = false;
      let latest: SavedScrollPosition | undefined;
      try {
        latest = parseSavedPosition(window.sessionStorage.getItem(key));
      } catch { return; }
      if (!latest || latest.top <= 0) { return; }
      const anchor = findAnchor(latest.anchorId);
      const target = anchor
        ? Math.max(0, Math.round(getLayoutTop(anchor) -
          (latest.anchorOffset ?? 0)))
        : latest.top;
      if (Math.abs(window.scrollY - target) <= 2) { return; }
      // Mobile browsers may reset scrollY while restoring a frozen document.
      // Reapply the already-saved position once; do not refresh or remount
      // the route and do not alter the detail-page back-navigation flow.
      window.scrollTo({ top: target, behavior: 'auto' });
    };

    const onVisibilityChange = () => {
      if (!isCurrentEntry()) { return; }
      if (document.hidden) { onPageHide(); }
      else { window.requestAnimationFrame(restoreAfterPageShow); }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', cancelForUserInput, { passive: true });
    window.addEventListener('touchmove', cancelForUserInput, { passive: true });
    window.addEventListener('pointerdown', cancelForUserInput, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', onPageHide, { passive: true });
    window.addEventListener('pageshow', restoreAfterPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('media-feed-exhausted', onFeedExhausted);
    const unsubscribe = subscribeToHistoryEntryChanges(() => {
      if (key !== getStorageKey()) {
        leftEntry = true;
        stopRestoring();
      }
      // Rapid Back and Forward may return before the intervening grid renders.
      if (leftEntry && matchesCommittedRoute()) {
        setHistoryRevision(revision => revision + 1);
      }
    });
    if (restoring && typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(restore);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (restoring && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(restore);
      resizeObserver.observe(document.documentElement);
    }
    if (restoring) {
      // Correct the already-rendered server page synchronously whenever the
      // anchor is present, then keep observers only for pages that need more
      // infinite-scroll content.
      restore();
      if (restoring && feedComplete) {
        settleAtReachablePosition();
      } else if (restoring) {
        window.requestAnimationFrame(restore);
        // A request can fail permanently or a feed can be interrupted before
        // its terminal event. Never leave restored cards frozen indefinitely.
        restoreTimeout = setTimeout(settleAtReachablePosition, 15_000);
      }
    }

    return () => {
      disposed = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', cancelForUserInput);
      window.removeEventListener('touchmove', cancelForUserInput);
      window.removeEventListener('pointerdown', cancelForUserInput);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', restoreAfterPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('media-feed-exhausted', onFeedExhausted);
      unsubscribe();
      stopRestoring();
    };
  }, [
    pathname, routeKey, resetAtStart, feedComplete, committedSearchQuery,
    historyRevision,
  ]);

  return restoredEntry;
}
