'use client';

import { RefObject, useEffect, useId, useState } from 'react';

// Images are prepared before they enter the viewport and remain mounted after
// that point. Video previews use their own stricter mount/unmount lifecycle.
// One shared observer keeps initial large-grid activation inexpensive.
const PRELOAD_AHEAD_PX = 1200;
const RELEASE_BEHIND_PX = 500;

type Entry = {
  element: HTMLElement
  isInRange: boolean
  setInRange: (inRange: boolean) => void
  preloadAheadPx: number
  releaseBehindPx: number
}

const entries = new Map<string, Entry>();
const idsByElement = new WeakMap<Element, string>();
const observers = new Map<string, IntersectionObserver>();
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

const setEntryRange = (entry: Entry, isInRange: boolean) => {
  // Image components are intentionally sticky for the current page visit. A
  // loaded image should not disappear and need to decode again when scrolling
  // back to it. Video posters still unmount only after their preview is ready.
  if (!isInRange) { return; }
  if (entry.isInRange === isInRange) { return; }
  entry.isInRange = isInRange;
  entry.setInRange(isInRange);
};

const refreshRanges = () => {
  const canLoad = !document.hidden;
  entries.forEach(entry => {
    setEntryRange(entry, canLoad && isInPreloadRange(
      entry.element,
      entry.preloadAheadPx,
      entry.releaseBehindPx,
    ));
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
      if (entry) { setEntryRange(entry, observerEntry.isIntersecting); }
    });
  }, { root: null, rootMargin, threshold: 0 });
  observers.set(rootMargin, observer);
  return observer;
};

const onPageHide = () => {
  // Keep image mounts intact for bfcache/app-return restores. Preview videos
  // are released separately by useVideoPreviewLifecycle.
};

const onPageShow = () => requestAnimationFrame(refreshRanges);

const onVisibilityChange = () => {
  if (!document.hidden) { onPageShow(); }
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

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      setIsInRange(false);
      return;
    }
    const id = `${reactId}-${Math.random().toString(36).slice(2)}`;
    const entry: Entry = {
      element,
      isInRange: false,
      setInRange: setIsInRange,
      preloadAheadPx,
      releaseBehindPx,
    };
    entries.set(id, entry);
    idsByElement.set(element, id);
    attachPageListeners();
    setEntryRange(entry, !document.hidden && isInPreloadRange(
      element,
      preloadAheadPx,
      releaseBehindPx,
    ));
    const observer = getObserver(preloadAheadPx, releaseBehindPx);
    observer?.observe(element);

    return () => {
      observer?.unobserve(element);
      idsByElement.delete(element);
      entries.delete(id);
      detachPageListeners();
    };
  }, [enabled, preloadAheadPx, reactId, ref, releaseBehindPx]);

  return enabled && isInRange;
}
