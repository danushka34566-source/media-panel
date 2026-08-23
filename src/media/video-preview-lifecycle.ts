'use client';

import { RefObject, useEffect, useId, useRef, useState } from 'react';

type DeviceCapabilities = {
  reducedMotion: boolean
  saveData: boolean
  deviceMemory?: number
  hardwareConcurrency?: number
  isMobile?: boolean
}

type PreviewEntry = {
  element: HTMLElement
  enabled: boolean
  preloadEnabled: boolean
  requiresCapableDevice: boolean
  preloadUrl?: string
  isMounted: boolean
  intersectionRatio: number
  isActive: boolean
  setMounted: (mounted: boolean) => void
  setActive: (active: boolean) => void
}

type NavigatorWithCapabilities = Navigator & {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

const entries = new Map<string, PreviewEntry>();
const idsByElement = new WeakMap<Element, string>();
let observer: IntersectionObserver | undefined;
let areGlobalListenersAttached = false;
let reducedMotionQuery: MediaQueryList | undefined;
let coarsePointerQuery: MediaQueryList | undefined;
let visibilityRefreshFrame: number | undefined;
let activePreviewUpdateFrame: number | undefined;
let isFullVideoPlaybackActive = false;
// Mount the real card video shortly before it enters the viewport. Reusing the
// same element avoids a second request/decoder startup when it becomes visible.
const PREVIEW_PRELOAD_AHEAD_PX = 2400;
const MAX_WARM_DESKTOP_PREVIEWS = 6;
const MAX_WARM_MOBILE_PREVIEWS = 2;

const getReducedMotionQuery = () =>
  reducedMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');

const getCoarsePointerQuery = () =>
  coarsePointerQuery ??= window.matchMedia('(pointer: coarse)');

export const canAutoplayGeneratedVideoPreview = ({
  reducedMotion,
  saveData,
}: DeviceCapabilities) => !reducedMotion && !saveData;

export const canAutoplayLargeVideoPreview = ({
  reducedMotion,
  saveData,
  deviceMemory,
  hardwareConcurrency,
  isMobile,
}: DeviceCapabilities) =>
  !reducedMotion &&
  !saveData &&
  !isMobile &&
  // Only block when the browser exposes memory info AND it's too low.
  // Many browsers (Firefox, Safari) don't expose deviceMemory at all —
  // treat unknown as capable rather than blocking.
  (deviceMemory === undefined || deviceMemory >= 4) &&
  (hardwareConcurrency === undefined || hardwareConcurrency >= 4);

export const shouldSuspendVideoPreviews = ({
  isMainVideoActuallyPlaying,
  isVideoFullscreen,
}: {
  isMainVideoActuallyPlaying: boolean
  isVideoFullscreen: boolean
}) => isMainVideoActuallyPlaying && isVideoFullscreen;

const getCurrentDeviceCapabilities = (): DeviceCapabilities => {
  const navigatorWithCapabilities = navigator as NavigatorWithCapabilities;
  return {
    reducedMotion: getReducedMotionQuery().matches,
    saveData: Boolean(navigatorWithCapabilities.connection?.saveData),
    deviceMemory: navigatorWithCapabilities.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    isMobile: getCoarsePointerQuery().matches ||
      window.innerWidth < 768,
  };
};

const isInPreviewPreloadRange = (element: HTMLElement) => {
  const { bottom, left, right, top } = element.getBoundingClientRect();
  return bottom > -PREVIEW_PRELOAD_AHEAD_PX &&
    right > 0 &&
    top < window.innerHeight + PREVIEW_PRELOAD_AHEAD_PX &&
    left < window.innerWidth;
};

const setPreviewMounted = (entry: PreviewEntry, mounted: boolean) => {
  if (entry.isMounted === mounted) { return; }
  entry.isMounted = mounted;
  entry.setMounted(mounted);
};

const updateActivePreviews = () => {
  const capabilities = typeof window !== 'undefined'
    ? getCurrentDeviceCapabilities()
    : undefined;
  const allowGeneratedVideoPreview = capabilities
    ? canAutoplayGeneratedVideoPreview(capabilities)
    : false;
  const allowLargeVideoPreview = capabilities
    ? canAutoplayLargeVideoPreview(capabilities)
    : false;
  if (
    !capabilities ||
    document.hidden ||
    !allowGeneratedVideoPreview
  ) {
    entries.forEach(entry => {
      setPreviewMounted(entry, false);
      if (entry.isActive) {
        entry.isActive = false;
        entry.setActive(false);
      }
    });
    return;
  }
  const viewportCenter = window.innerHeight / 2;
  const warmEntries = new Set([...entries.values()]
    .filter(entry => entry.preloadEnabled &&
      Boolean(entry.preloadUrl) &&
      !isFullVideoPlaybackActive &&
      isInPreviewPreloadRange(entry.element))
    .sort((a, b) => {
      const aRect = a.element.getBoundingClientRect();
      const bRect = b.element.getBoundingClientRect();
      const aCenter = aRect.top + aRect.height / 2;
      const bCenter = bRect.top + bRect.height / 2;
      return Math.abs(aCenter - viewportCenter) -
        Math.abs(bCenter - viewportCenter);
    })
    .slice(0, capabilities.isMobile
      ? MAX_WARM_MOBILE_PREVIEWS
      : MAX_WARM_DESKTOP_PREVIEWS));
  entries.forEach(entry => {
    const shouldBeActive = entry.enabled &&
      entry.intersectionRatio > 0 &&
      !isFullVideoPlaybackActive &&
      (!entry.requiresCapableDevice || allowLargeVideoPreview);
    setPreviewMounted(entry, shouldBeActive || warmEntries.has(entry));
    if (entry.isActive !== shouldBeActive) {
      entry.isActive = shouldBeActive;
      entry.setActive(shouldBeActive);
    }
  });
};

// A detail page can register hundreds of cards in one React commit. Running
// a full geometry scan once per card creates an O(n²) layout storm and makes
// navigation lag. Coalesce lifecycle updates to one animation frame.
const scheduleActivePreviewUpdate = () => {
  if (activePreviewUpdateFrame !== undefined) { return; }
  activePreviewUpdateFrame = window.requestAnimationFrame(() => {
    activePreviewUpdateFrame = undefined;
    updateActivePreviews();
  });
};

const getObserver = () => {
  if (typeof IntersectionObserver === 'undefined') { return undefined; }
  observer ??= new IntersectionObserver(observerEntries => {
    observerEntries.forEach(observerEntry => {
      const id = idsByElement.get(observerEntry.target);
      const entry = id ? entries.get(id) : undefined;
      if (entry) {
        entry.intersectionRatio = observerEntry.isIntersecting
          ? observerEntry.intersectionRatio
          : 0;
      }
    });
    updateActivePreviews();
  }, {
    root: null,
    threshold: 0,
  });
  return observer;
};

const isInViewport = (element: HTMLElement) => {
  const { bottom, left, right, top } = element.getBoundingClientRect();
  return bottom > 0 &&
    right > 0 &&
    top < window.innerHeight &&
    left < window.innerWidth;
};

const isVideoActuallyFullscreen = () => {
  // Picture-in-Picture is intentionally excluded. Its player is designed to
  // survive route navigation while normal page previews keep working.
  const fullscreenElement = document.fullscreenElement;
  if (
    fullscreenElement instanceof HTMLVideoElement ||
    fullscreenElement?.querySelector?.('video')
  ) {
    return true;
  }
  return Array.from(document.querySelectorAll('video')).some(video =>
    (video as HTMLVideoElement & { webkitPresentationMode?: string })
      .webkitPresentationMode === 'fullscreen',
  );
};

const releaseStaleFullVideoPlayback = () => {
  if (isFullVideoPlaybackActive && !isVideoActuallyFullscreen()) {
    isFullVideoPlaybackActive = false;
  }
};

const refreshViewportIntersections = () => {
  // A route change can remove the full-list player before its fullscreen
  // callback runs. Reconcile against the browser state so a stale module-level
  // flag cannot keep newly mounted grid previews suspended.
  releaseStaleFullVideoPlayback();
  entries.forEach(entry => {
    entry.intersectionRatio = isInViewport(entry.element) ? 1 : 0;
  });
  updateActivePreviews();
};

const scheduleViewportRefresh = () => {
  if (visibilityRefreshFrame !== undefined) { return; }
  visibilityRefreshFrame = window.requestAnimationFrame(() => {
    visibilityRefreshFrame = undefined;
    refreshViewportIntersections();
  });
};

const cancelScheduledViewportRefresh = () => {
  if (visibilityRefreshFrame === undefined) { return; }
  window.cancelAnimationFrame(visibilityRefreshFrame);
  visibilityRefreshFrame = undefined;
};

const onPageHide = () => {
  cancelScheduledViewportRefresh();
  if (activePreviewUpdateFrame !== undefined) {
    window.cancelAnimationFrame(activePreviewUpdateFrame);
    activePreviewUpdateFrame = undefined;
  }
  entries.forEach(entry => {
    setPreviewMounted(entry, false);
    if (entry.isActive) {
      entry.isActive = false;
      entry.setActive(false);
    }
  });
};

const onPageShow = () => {
  if (document.hidden) { return; }
  cancelScheduledViewportRefresh();
  // Mobile browsers can suspend IntersectionObserver and animation-frame
  // callbacks while the phone is locked. Recompute synchronously on resume so
  // visible previews remount even when the old callback never runs.
  refreshViewportIntersections();
  scheduleViewportRefresh();
};

const onVisibilityOrCapabilityChange = () => {
  if (document.hidden) { onPageHide(); }
  else { onPageShow(); }
};

const onFullscreenChange = () => {
  releaseStaleFullVideoPlayback();
  refreshViewportIntersections();
};

export const setFullVideoPlaybackActive = (isActive: boolean) => {
  if (isFullVideoPlaybackActive === isActive) { return; }
  isFullVideoPlaybackActive = isActive;
  updateActivePreviews();
};

const addMediaQueryListener = (query: MediaQueryList) => {
  if (query.addEventListener) {
    query.addEventListener('change', onVisibilityOrCapabilityChange);
  } else {
    query.addListener(onVisibilityOrCapabilityChange);
  }
};

const removeMediaQueryListener = (query?: MediaQueryList) => {
  if (!query) { return; }
  if (query.removeEventListener) {
    query.removeEventListener('change', onVisibilityOrCapabilityChange);
  } else {
    query.removeListener(onVisibilityOrCapabilityChange);
  }
};

const attachGlobalListeners = () => {
  if (areGlobalListenersAttached) { return; }
  areGlobalListenersAttached = true;
  window.addEventListener('resize', scheduleViewportRefresh, {
    passive: true,
  });
  window.addEventListener('scroll', scheduleViewportRefresh, {
    passive: true,
    capture: true,
  });
  document.addEventListener('visibilitychange', onVisibilityOrCapabilityChange);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('freeze', onPageHide);
  document.addEventListener('resume', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', onPageShow);
  addMediaQueryListener(getReducedMotionQuery());
  addMediaQueryListener(getCoarsePointerQuery());
};

const detachGlobalListeners = () => {
  if (!areGlobalListenersAttached || entries.size > 0) { return; }
  areGlobalListenersAttached = false;
  if (activePreviewUpdateFrame !== undefined) {
    window.cancelAnimationFrame(activePreviewUpdateFrame);
    activePreviewUpdateFrame = undefined;
  }
  window.removeEventListener('resize', scheduleViewportRefresh);
  window.removeEventListener('scroll', scheduleViewportRefresh, true);
  document.removeEventListener(
    'visibilitychange',
    onVisibilityOrCapabilityChange,
  );
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  document.removeEventListener('freeze', onPageHide);
  document.removeEventListener('resume', onPageShow);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  window.removeEventListener('focus', onPageShow);
  removeMediaQueryListener(reducedMotionQuery);
  removeMediaQueryListener(coarsePointerQuery);
};

export default function useVideoPreviewLifecycle({
  ref,
  enabled,
  preloadEnabled = false,
  requiresCapableDevice = false,
  preloadUrl,
}: {
  ref: RefObject<HTMLElement | null>
  enabled: boolean
  preloadEnabled?: boolean
  requiresCapableDevice?: boolean
  preloadUrl?: string
}) {
  const reactId = useId();
  const activationKey = requiresCapableDevice ? 'capable' : 'standard';
  const [previewState, setPreviewState] = useState<{
    activeKey?: string
    exitingKey?: string
    activationId: number
  }>({ activationId: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const exitFrame = useRef<number | undefined>(undefined);

  useEffect(() => {
    const element = ref.current;
    if (!element || (!enabled && !preloadEnabled)) { return; }
    const id = `${reactId}-${Math.random().toString(36).slice(2)}`;
    const entry: PreviewEntry = {
      element,
      enabled,
      preloadEnabled,
      requiresCapableDevice,
      preloadUrl,
      isMounted: false,
      intersectionRatio: 0,
      isActive: false,
      setMounted: setIsMounted,
      setActive: active => {
        if (active) {
          if (exitFrame.current !== undefined) {
            cancelAnimationFrame(exitFrame.current);
            exitFrame.current = undefined;
          }
          setPreviewState(state => ({
            activeKey: activationKey,
            activationId: state.activationId + 1,
          }));
          return;
        }
        // Insert the poster in this render, then remove the video on the next
        // frame. This prevents a blank frame as previews leave the viewport.
        setPreviewState(state => ({
          exitingKey: activationKey,
          activationId: state.activationId,
        }));
        exitFrame.current = requestAnimationFrame(() => {
          exitFrame.current = undefined;
          setPreviewState(state => state.exitingKey === activationKey
            ? { activationId: state.activationId }
            : state);
        });
      },
    };
    entries.set(id, entry);
    idsByElement.set(element, id);
    attachGlobalListeners();
    // IntersectionObserver callbacks are asynchronous. Set the initial state
    // synchronously so visible full-list cards can mount their previews on the
    // first paint instead of waiting for a later scroll or observer callback.
    releaseStaleFullVideoPlayback();
    entry.intersectionRatio = isInViewport(element) ? 1 : 0;
    // Small lists benefit from immediate activation (and avoid a blank first
    // frame). Once a detail/full page has many cards, defer repeated geometry
    // scans to one frame instead of doing O(n²) work during mount.
    if (entries.size <= 20) {
      updateActivePreviews();
    } else {
      scheduleActivePreviewUpdate();
    }
    getObserver()?.observe(element);
    scheduleViewportRefresh();

    return () => {
      if (exitFrame.current !== undefined) {
        cancelAnimationFrame(exitFrame.current);
      }
      setPreviewMounted(entry, false);
      if (entry.isActive) { entry.setActive(false); }
      observer?.unobserve(element);
      idsByElement.delete(element);
      entries.delete(id);
      detachGlobalListeners();
      scheduleActivePreviewUpdate();
    };
  }, [
    activationKey,
    enabled,
    preloadEnabled,
    preloadUrl,
    reactId,
    ref,
    requiresCapableDevice,
  ]);

  return {
    shouldMount: (enabled || preloadEnabled) && isMounted,
    isActive: enabled && previewState.activeKey === activationKey,
    isExiting: enabled && previewState.exitingKey === activationKey,
    activationId: previewState.activationId,
  };
}
