'use client';

import {
  RefObject,
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

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
  mountOnlyWhenVisible: boolean
  requiresCapableDevice: boolean
  activeGroupId?: string
  sequenceStartup: boolean
  startupPriority: boolean
  isPrepared: boolean
  preloadUrl?: string
  isMounted: boolean
  isInPreloadRange: boolean
  intersectionRatio: number
  isActive: boolean
  setMounted: (mounted: boolean) => void
  setActive: (active: boolean, immediate?: boolean) => void
}

type NavigatorWithCapabilities = Navigator & {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

const entries = new Map<string, PreviewEntry>();
const idsByElement = new WeakMap<Element, string>();
let observer: IntersectionObserver | undefined;
let preloadObserver: IntersectionObserver | undefined;
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
const PREVIEW_STARTUP_CONCURRENCY = 5;

type PreviewGeometryCache = Map<HTMLElement, DOMRect>;

// Reuse each card's geometry during one refresh. The visibility and warm-up
// passes need the same measurements, so reading them once avoids duplicate
// layout work without changing any lifecycle decisions.
const getPreviewRect = (
  element: HTMLElement,
  geometryCache: PreviewGeometryCache,
) => {
  const cached = geometryCache.get(element);
  if (cached) { return cached; }
  const rect = element.getBoundingClientRect();
  geometryCache.set(element, rect);
  return rect;
};

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

export const getPreviewStartupConcurrency = (
  _capabilities: DeviceCapabilities,
) => PREVIEW_STARTUP_CONCURRENCY;

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

const isInPreviewPreloadRange = (
  element: HTMLElement,
  geometryCache: PreviewGeometryCache,
) => {
  const { bottom, left, right, top } = getPreviewRect(element, geometryCache);
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

const updateActivePreviews = (
  geometryCache: PreviewGeometryCache = new Map(),
) => {
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
      entry.isPrepared = false;
      setPreviewMounted(entry, false);
      if (entry.isActive) {
        entry.isActive = false;
        entry.setActive(false, true);
      }
    });
    return;
  }
  const viewportCenter = window.innerHeight / 2;
  const warmEntries = new Set([...entries.values()]
    .filter(entry => entry.preloadEnabled &&
      !entry.mountOnlyWhenVisible &&
      !entry.sequenceStartup &&
      Boolean(entry.preloadUrl) &&
      !isFullVideoPlaybackActive &&
      entry.isInPreloadRange)
    .sort((a, b) => {
      const aRect = getPreviewRect(a.element, geometryCache);
      const bRect = getPreviewRect(b.element, geometryCache);
      const aCenter = aRect.top + aRect.height / 2;
      const bCenter = bRect.top + bRect.height / 2;
      return Math.abs(aCenter - viewportCenter) -
        Math.abs(bCenter - viewportCenter);
    })
    .slice(0, capabilities.isMobile
      ? MAX_WARM_MOBILE_PREVIEWS
      : MAX_WARM_DESKTOP_PREVIEWS));
  const canActivate = (entry: PreviewEntry) => entry.enabled &&
    entry.intersectionRatio > 0 &&
    !isFullVideoPlaybackActive &&
    (!entry.requiresCapableDevice || allowLargeVideoPreview);
  const sequenceMountedEntries = new Set<PreviewEntry>();
  const sequenceActiveEntries = new Set<PreviewEntry>();
  const sequencePreparationCandidates: PreviewEntry[] = [];
  const sequenceGroups = new Map<string, PreviewEntry[]>();
  entries.forEach(entry => {
    if (!entry.sequenceStartup || !entry.activeGroupId || !canActivate(entry)) {
      return;
    }
    const group = sequenceGroups.get(entry.activeGroupId) ?? [];
    group.push(entry);
    sequenceGroups.set(entry.activeGroupId, group);
  });
  sequenceGroups.forEach(group => {
    const ordered = group.sort((a, b) => {
      if (a.startupPriority !== b.startupPriority) {
        return a.startupPriority ? -1 : 1;
      }
      const aRect = getPreviewRect(a.element, geometryCache);
      const bRect = getPreviewRect(b.element, geometryCache);
      return aRect.top - bRect.top || aRect.left - bRect.left;
    });
    ordered.filter(entry => entry.isPrepared)
      .forEach(entry => {
        sequenceMountedEntries.add(entry);
        sequenceActiveEntries.add(entry);
      });
    sequencePreparationCandidates.push(
      ...ordered.filter(entry => !entry.isPrepared),
    );
  });
  // There may be several MediaGrid instances on an infinite page. Apply one
  // device-wide startup budget across all of them; prepared previews keep
  // playing while the next bounded batch decodes.
  const orderedPreparationCandidates = sequencePreparationCandidates.sort((a, b) => {
    if (a.startupPriority !== b.startupPriority) {
      return a.startupPriority ? -1 : 1;
    }
    const aRect = getPreviewRect(a.element, geometryCache);
    const bRect = getPreviewRect(b.element, geometryCache);
    return aRect.top - bRect.top || aRect.left - bRect.left;
  });
  // The interacted card sorts first, then the remaining startup slots follow
  // visual order. Keep one device-wide budget across infinite grid batches.
  const nextGlobalPreparations = orderedPreparationCandidates.slice(
    0,
    getPreviewStartupConcurrency(capabilities),
  );
  nextGlobalPreparations.forEach(entry => sequenceMountedEntries.add(entry));
  entries.forEach(entry => {
    const isSequenced = entry.sequenceStartup && Boolean(entry.activeGroupId);
    const shouldBeActive = canActivate(entry) && (
      !isSequenced || sequenceActiveEntries.has(entry)
    );
    const shouldBeMounted = shouldBeActive ||
      (isSequenced && sequenceMountedEntries.has(entry)) ||
      (!entry.mountOnlyWhenVisible && warmEntries.has(entry));
    if (!shouldBeMounted && entry.isPrepared) {
      entry.isPrepared = false;
    }
    setPreviewMounted(
      entry,
      shouldBeMounted,
    );
    if (entry.isActive !== shouldBeActive) {
      entry.isActive = shouldBeActive;
      entry.setActive(shouldBeActive);
    }
  });
};

// A detail page can register hundreds of cards in one React commit. Coalesce
// lifecycle updates to one animation frame and share geometry reads between
// the visibility and warm-preview passes.
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
    rootMargin: '0px',
    threshold: 0,
  });
  return observer;
};

const getPreloadObserver = () => {
  if (typeof IntersectionObserver === 'undefined') { return undefined; }
  preloadObserver ??= new IntersectionObserver(observerEntries => {
    observerEntries.forEach(observerEntry => {
      const id = idsByElement.get(observerEntry.target);
      const entry = id ? entries.get(id) : undefined;
      if (entry) { entry.isInPreloadRange = observerEntry.isIntersecting; }
    });
    scheduleActivePreviewUpdate();
  }, {
    root: null,
    rootMargin: `${PREVIEW_PRELOAD_AHEAD_PX}px 0px`,
    threshold: 0,
  });
  return preloadObserver;
};

const isInViewport = (
  element: HTMLElement,
  geometryCache: PreviewGeometryCache,
) => {
  const { bottom, left, right, top } = getPreviewRect(element, geometryCache);
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
  const geometryCache: PreviewGeometryCache = new Map();
  entries.forEach(entry => {
    entry.intersectionRatio = isInViewport(entry.element, geometryCache) ? 1 : 0;
    entry.isInPreloadRange = isInPreviewPreloadRange(
      entry.element,
      geometryCache,
    );
  });
  updateActivePreviews(geometryCache);
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
    entry.isPrepared = false;
    setPreviewMounted(entry, false);
    if (entry.isActive) {
      entry.isActive = false;
      entry.setActive(false, true);
    }
  });
};

const onPageShow = () => {
  if (document.hidden) { return; }
  cancelScheduledViewportRefresh();
  // Preserve the last observer decisions across a short mobile suspension.
  // Refill the bounded decoder queue from that state without forcing layout
  // for every card on the first interactive frame. IntersectionObserver will
  // deliver any genuine viewport changes after the browser resumes.
  scheduleActivePreviewUpdate();
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
  // Release observer registrations when a route removes the last preview.
  // Keeping empty observers alive is small by itself, but over repeated
  // route changes it leaves browser-side lifecycle bookkeeping behind.
  observer?.disconnect();
  preloadObserver?.disconnect();
  observer = undefined;
  preloadObserver = undefined;
  window.removeEventListener('resize', scheduleViewportRefresh);
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
  mountOnlyWhenVisible = false,
  requiresCapableDevice = false,
  activeGroupId,
  sequenceStartup = false,
  startupPriority = false,
  preloadUrl,
}: {
  ref: RefObject<HTMLElement | null>
  enabled: boolean
  preloadEnabled?: boolean
  // Detail-page previews should not keep paused video elements mounted ahead
  // of the viewport. Posters remain mounted by the card component.
  mountOnlyWhenVisible?: boolean
  requiresCapableDevice?: boolean
  activeGroupId?: string
  sequenceStartup?: boolean
  startupPriority?: boolean
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
  const entryRef = useRef<PreviewEntry | undefined>(undefined);
  const startupPriorityRef = useRef(startupPriority);
  startupPriorityRef.current = startupPriority;

  useEffect(() => {
    const element = ref.current;
    if (!element || (!enabled && !preloadEnabled)) { return; }
    const id = `${reactId}-${Math.random().toString(36).slice(2)}`;
    const entry: PreviewEntry = {
      element,
      enabled,
      preloadEnabled,
      mountOnlyWhenVisible,
      requiresCapableDevice,
      activeGroupId,
      sequenceStartup,
      startupPriority: startupPriorityRef.current,
      isPrepared: false,
      preloadUrl,
      isMounted: false,
      isInPreloadRange: false,
      intersectionRatio: 0,
      isActive: false,
      setMounted: mounted => {
        // Decoder-slot refills can mount five videos together. Treat ordinary
        // preview mounts as background rendering so React can interrupt that
        // work for a tap on navigation, tags, or controls. The card the user
        // explicitly targeted remains urgent for immediate feedback.
        if (startupPriorityRef.current) {
          setIsMounted(mounted);
        } else {
          startTransition(() => setIsMounted(mounted));
        }
      },
      setActive: (active, immediate = false) => {
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
        if (immediate) {
          if (exitFrame.current !== undefined) {
            cancelAnimationFrame(exitFrame.current);
            exitFrame.current = undefined;
          }
          setPreviewState(state => ({ activationId: state.activationId }));
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
    entryRef.current = entry;
    entries.set(id, entry);
    idsByElement.set(element, id);
    attachGlobalListeners();
    // IntersectionObserver callbacks are asynchronous. Set the initial state
    // synchronously so visible full-list cards can mount their previews on the
    // first paint instead of waiting for a later scroll or observer callback.
    releaseStaleFullVideoPlayback();
    const geometryCache: PreviewGeometryCache = new Map();
    entry.intersectionRatio = isInViewport(element, geometryCache) ? 1 : 0;
    entry.isInPreloadRange = isInPreviewPreloadRange(element, geometryCache);
    // Small lists benefit from immediate activation (and avoid a blank first
    // frame). Once a detail/full page has many cards, defer repeated geometry
    // scans to one frame instead of doing O(n²) work during mount.
    if (entries.size <= 20) {
      updateActivePreviews(geometryCache);
    } else {
      scheduleActivePreviewUpdate();
    }
    getObserver()?.observe(element);
    getPreloadObserver()?.observe(element);
    return () => {
      if (exitFrame.current !== undefined) {
        cancelAnimationFrame(exitFrame.current);
      }
      setPreviewMounted(entry, false);
      entry.isActive = false;
      observer?.unobserve(element);
      preloadObserver?.unobserve(element);
      idsByElement.delete(element);
      entries.delete(id);
      if (entryRef.current === entry) { entryRef.current = undefined; }
      detachGlobalListeners();
      scheduleActivePreviewUpdate();
    };
  }, [
    activationKey,
    activeGroupId,
    enabled,
    mountOnlyWhenVisible,
    sequenceStartup,
    preloadEnabled,
    preloadUrl,
    reactId,
    ref,
    requiresCapableDevice,
  ]);

  useEffect(() => {
    const entry = entryRef.current;
    if (!entry || entry.startupPriority === startupPriority) { return; }
    entry.startupPriority = startupPriority;
    updateActivePreviews();
  }, [startupPriority]);

  return {
    shouldMount: (enabled || preloadEnabled) && isMounted,
    isActive: enabled && previewState.activeKey === activationKey,
    isExiting: enabled && previewState.exitingKey === activationKey,
    activationId: previewState.activationId,
    markPrepared: () => {
      const entry = entryRef.current;
      if (!entry) { return false; }
      if (entry.isPrepared) { return entry.isActive; }
      entry.isPrepared = true;
      const capabilities = getCurrentDeviceCapabilities();
      const shouldActivate = entry.enabled &&
        entry.intersectionRatio > 0 &&
        !document.hidden &&
        !isFullVideoPlaybackActive &&
        canAutoplayGeneratedVideoPreview(capabilities) &&
        (
          !entry.requiresCapableDevice ||
          canAutoplayLargeVideoPreview(capabilities)
        );
      if (shouldActivate && !entry.isActive) {
        entry.isActive = true;
        entry.setActive(true);
      }
      // LoadedData events can arrive together. Refill all newly available
      // decoder slots once per frame instead of rescanning the full grid for
      // every event, while the decoded card starts immediately above.
      scheduleActivePreviewUpdate();
      return shouldActivate;
    },
  };
}
