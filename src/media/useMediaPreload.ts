'use client';

import { RefObject, useEffect, useId, useState } from 'react';

// Images are prepared well before they enter the viewport. Once a card has
// entered that window its image stays mounted, so scrolling back does not
// visibly remove and recreate the poster. Native lazy loading and the browser
// cache still control when bytes are fetched and decoded.
// One shared observer keeps initial large-grid activation inexpensive.
const PRELOAD_AHEAD_PX = 1200;
const RELEASE_BEHIND_PX = 500;

type Entry = {
  id: string
  element: HTMLElement
  isInRange: boolean
  setInRange: (inRange: boolean) => void
  setRetained: (retained: boolean) => void
  preloadAheadPx: number
  releaseBehindPx: number
}

const entries = new Map<string, Entry>();
const idsByElement = new WeakMap<Element, string>();
const observers = new Map<string, IntersectionObserver>();
const retainedEntries = new Map<string, number>();
let retentionSequence = 0;
let rangeUpdateFrame: number | undefined;
const pendingRangeEntries = new Map<Entry, boolean>();
// Keep a bounded nearby history so quick back/forward scrolling is stable
// without retaining decoded bitmaps for an unbounded full-page feed.
const MAX_RETAINED_IMAGES = 48;
let arePageListenersAttached = false;

const isInPreloadRange = (
  element: HTMLElement,
  preloadAheadPx: number,
  releaseBehindPx: number,
) => {
  const { bottom, left, right, top } = element.getBoundingClientRect();
  return bottom > -releaseBehindPx &&
    right > 0 &&
    top < window.innerHeight + preloadAheadPx &&
    left < window.innerWidth;
};

const retainEntry = (entry: Entry) => {
  retainedEntries.delete(entry.id);
  retainedEntries.set(entry.id, ++retentionSequence);
  entry.setRetained(true);
  while (retainedEntries.size > MAX_RETAINED_IMAGES) {
    // Never evict a card that is still in the viewport/preload range. Doing
    // so makes its poster disappear for a frame while a new row is entering,
    // which is the black flash seen during fast grid scrolling.
    const oldestId = [...retainedEntries.keys()].find(id =>
      !entries.get(id)?.isInRange,
    );
    if (!oldestId) { break; }
    retainedEntries.delete(oldestId);
    entries.get(oldestId)?.setRetained(false);
  }
};

const setEntryRange = (entry: Entry, isInRange: boolean) => {
  if (entry.isInRange === isInRange) { return; }
  entry.isInRange = isInRange;
  entry.setInRange(isInRange);
  if (isInRange) { retainEntry(entry); }
};

const scheduleRangeUpdate = () => {
  if (rangeUpdateFrame !== undefined) { return; }
  rangeUpdateFrame = window.requestAnimationFrame(() => {
    rangeUpdateFrame = undefined;
    const changedEntries = [...pendingRangeEntries.entries()];
    pendingRangeEntries.clear();
    changedEntries.forEach(([entry, isInRange]) => {
      if (entries.has(entry.id)) {
        setEntryRange(entry, !document.hidden && isInRange);
      }
    });
  });
};

const getObserver = (preloadAheadPx: number, releaseBehindPx: number) => {
  if (typeof IntersectionObserver === 'undefined') { return undefined; }
  // In the usual downward scroll direction, the bottom margin is ahead and
  // the top margin keeps recently viewed images available behind the user.
  const rootMargin = `${releaseBehindPx}px 0px ${preloadAheadPx}px 0px`;
  let observer = observers.get(rootMargin);
  if (observer) { return observer; }
  observer = new IntersectionObserver(observerEntries => {
    observerEntries.forEach(observerEntry => {
      const id = idsByElement.get(observerEntry.target);
      const entry = id ? entries.get(id) : undefined;
      if (entry) {
        // Store the browser's latest decision on the entry, then apply all
        // changes in one frame. This avoids one state/update burst per card
        // when a fast fling crosses many rows at once.
        pendingRangeEntries.set(entry, observerEntry.isIntersecting);
      }
    });
    scheduleRangeUpdate();
  }, { root: null, rootMargin, threshold: 0 });
  observers.set(rootMargin, observer);
  return observer;
};

const onPageHide = () => {
  // Discard observer decisions queued before the document was suspended.
  // Applying them after this point would immediately re-promote hidden cards.
  pendingRangeEntries.clear();
  // Keep both the bounded history and the current range decisions across a
  // mobile lock. Demoting every visible/ahead card creates a React update
  // burst while the document freezes, followed by a full-grid layout scan on
  // unlock. IntersectionObserver will report any actual viewport changes.
};

const onPageShow = () => {
  if (document.hidden) { return; }
  // Flush decisions the browser already computed without synchronously
  // measuring every card. Normal observer delivery handles the next frame.
  observers.forEach(observer => {
    observer.takeRecords().forEach(observerEntry => {
      const id = idsByElement.get(observerEntry.target);
      const entry = id ? entries.get(id) : undefined;
      if (entry) {
        pendingRangeEntries.set(entry, observerEntry.isIntersecting);
      }
    });
  });
  if (pendingRangeEntries.size > 0) { scheduleRangeUpdate(); }
};

const onVisibilityChange = () => {
  if (document.hidden) { onPageHide(); }
  else { onPageShow(); }
};

const attachPageListeners = () => {
  if (arePageListenersAttached) { return; }
  arePageListenersAttached = true;
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibilityChange);
};

const detachPageListeners = () => {
  if (!arePageListenersAttached || entries.size > 0) { return; }
  arePageListenersAttached = false;
  if (rangeUpdateFrame !== undefined) {
    window.cancelAnimationFrame(rangeUpdateFrame);
    rangeUpdateFrame = undefined;
  }
  pendingRangeEntries.clear();
  observers.forEach(observer => observer.disconnect());
  observers.clear();
  retainedEntries.clear();
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  document.removeEventListener('visibilitychange', onVisibilityChange);
};

export default function useMediaPreload({
  ref,
  enabled = true,
  preloadAheadPx = PRELOAD_AHEAD_PX,
  releaseBehindPx = RELEASE_BEHIND_PX,
}: {
  ref: RefObject<HTMLElement | null>
  enabled?: boolean
  preloadAheadPx?: number
  releaseBehindPx?: number
}) {
  const reactId = useId();
  const [isInRange, setIsInRange] = useState(false);
  const [hasBeenInRange, setHasBeenInRange] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      setIsInRange(false);
      setHasBeenInRange(false);
      return;
    }
    const id = `${reactId}-${Math.random().toString(36).slice(2)}`;
    const entry: Entry = {
      id,
      element,
      isInRange: false,
      setInRange: setIsInRange,
      setRetained: setHasBeenInRange,
      preloadAheadPx,
      releaseBehindPx,
    };
    entries.set(id, entry);
    idsByElement.set(element, id);
    attachPageListeners();
    const initialInRange = !document.hidden && isInPreloadRange(
      element,
      preloadAheadPx,
      releaseBehindPx,
    );
    setEntryRange(entry, initialInRange);
    if (initialInRange) { setHasBeenInRange(true); }
    const observer = getObserver(preloadAheadPx, releaseBehindPx);
    observer?.observe(element);

    return () => {
      observer?.unobserve(element);
      idsByElement.delete(element);
      entries.delete(id);
      retainedEntries.delete(id);
      detachPageListeners();
    };
  }, [enabled, preloadAheadPx, reactId, ref, releaseBehindPx]);

  return {
    isInRange: enabled && isInRange,
    shouldLoad: enabled && (isInRange || hasBeenInRange),
  };
}
