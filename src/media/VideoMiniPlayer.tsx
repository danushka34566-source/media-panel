'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AnimatePresence,
  animate,
  motion,
  type PanInfo,
  useDragControls,
  useMotionValue,
} from 'framer-motion';
import { VideoPlaybackManager } from '@/utility/VideoPlaybackManager';
import {
  LuMaximize,
  LuPause,
  LuPlay,
  LuVolume2,
  LuVolumeX,
} from 'react-icons/lu';
import {
  getDockedVideo,
  getDockedVideoServerSnapshot,
  getActiveDetailVideoMediaId,
  subscribeVideoMiniPlayer,
  updateDockedVideo,
  clearDockedVideo,
  requestDetailVideoRestore,
  PERSISTENT_VIDEO_HANDOFF_READY_EVENT,
} from './video-mini-player';

const formatPlayerTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) { return '0:00'; }
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = `${totalSeconds % 60}`.padStart(2, '0');
  return hours > 0
    ? `${hours}:${`${minutes}`.padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
};

export default function VideoMiniPlayer() {
  const router = useRouter();
  const boundsRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLElement>(null);
  const dragControls = useDragControls();
  const miniX = useMotionValue(0);
  const miniY = useMotionValue(0);
  const miniScale = useMotionValue(1);
  const cornerRef = useRef<'tl' | 'tr' | 'bl' | 'br'>('br');
  const videoRef = useRef<HTMLVideoElement>(null);
  const miniGestureMovedRef = useRef(false);
  const miniActionRef = useRef<'idle' | 'dragging' | 'opening' | 'dismissing'>('idle');
  const gestureSessionRef = useRef(0);
  const suppressClickUntilRef = useRef(0);
  const pendingActionTimerRef = useRef<number | undefined>(undefined);
  const controlsTimerRef = useRef<number | undefined>(undefined);
  const handoffReadyMediaRef = useRef<string | undefined>(undefined);
  const resumeTimeRef = useRef<number | undefined>(undefined);
  const dockedVideo = useSyncExternalStore(
    subscribeVideoMiniPlayer,
    getDockedVideo,
    getDockedVideoServerSnapshot,
  );
  const [useFallbackSource, setUseFallbackSource] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const source = dockedVideo && useFallbackSource && dockedVideo.fallbackUrl
    ? dockedVideo.fallbackUrl
    : dockedVideo?.sourceUrl;
  const isPendingDetailFold = Boolean(
    dockedVideo &&
    getActiveDetailVideoMediaId() === dockedVideo.mediaId &&
    document.querySelector<HTMLElement>(
      `[data-media-detail-fold-panel="${dockedVideo.mediaId}"]`,
    )?.dataset.foldCommitting === 'true',
  );
  const detailViewport = dockedVideo &&
    getActiveDetailVideoMediaId() === dockedVideo.mediaId
    ? Array.from(document.querySelectorAll<HTMLElement>(
      '[data-detail-video-viewport]',
    )).find(element =>
      element.dataset.detailVideoViewport === dockedVideo.mediaId)
    : undefined;
  const detailViewportRect = detailViewport?.getBoundingClientRect();
  const isDetailPlayerVisible = Boolean(
    detailViewportRect &&
    detailViewportRect.bottom > headerHeight &&
    detailViewportRect.top < window.innerHeight &&
    detailViewportRect.width > 40 &&
    detailViewportRect.height > 40,
  );
  const requestPlayback = useCallback((video: HTMLVideoElement) => {
    void VideoPlaybackManager.requestPlay(video).catch(() => undefined);
  }, []);
  const scheduleControlsHide = useCallback(() => {
    if (controlsTimerRef.current !== undefined) {
      window.clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = window.setTimeout(() => {
      controlsTimerRef.current = undefined;
      setControlsVisible(false);
    }, 3200);
  }, []);
  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);
  const toggleControls = useCallback(() => {
    if (
      miniActionRef.current !== 'idle' ||
      Date.now() < suppressClickUntilRef.current
    ) { return; }
    setControlsVisible(current => {
      if (current) {
        if (controlsTimerRef.current !== undefined) {
          window.clearTimeout(controlsTimerRef.current);
          controlsTimerRef.current = undefined;
        }
        return false;
      }
      scheduleControlsHide();
      return true;
    });
  }, [scheduleControlsHide]);
  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) { return; }
    if (video.paused || video.ended) {
      requestPlayback(video);
    } else {
      video.pause();
    }
    showControls();
  }, [requestPlayback, showControls]);
  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (!video) { return; }
    video.muted = !video.muted;
    updateDockedVideo({ muted: video.muted }, true);
    setIsMuted(video.muted);
    showControls();
  }, [showControls]);
  const enterFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) { return; }
    const webkitVideo = video as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void
    };
    if (video.requestFullscreen) {
      void video.requestFullscreen().catch(() => undefined);
    } else {
      try { webkitVideo.webkitEnterFullscreen?.(); } catch {}
    }
    showControls();
  }, [showControls]);
  const signalHandoffReady = useCallback((video: HTMLVideoElement) => {
    const latest = getDockedVideo();
    const mediaId = video.dataset.mediaId;
    if (
      !latest ||
      !mediaId ||
      latest.mediaId !== mediaId ||
      !latest.pendingHandoff ||
      video.paused ||
      handoffReadyMediaRef.current === mediaId
    ) { return; }
    handoffReadyMediaRef.current = mediaId;
    video.muted = latest.muted;
    // Publish the new owner before releasing the detail player. Keeping the
    // store on `pendingHandoff: true` left React free to re-apply the temporary
    // muted prop after the imperative unmute and made the mini appear stuck.
    updateDockedVideo({
      pendingHandoff: false,
      muted: latest.muted,
    }, true);
    window.dispatchEvent(new CustomEvent(
      PERSISTENT_VIDEO_HANDOFF_READY_EVENT,
      { detail: { mediaId } },
    ));
  }, []);
  const openDetails = useCallback((fromGesture = false) => {
    const currentDockedVideo = getDockedVideo();
    if (
      !currentDockedVideo ||
      miniActionRef.current === 'dismissing' ||
      (!fromGesture && miniActionRef.current !== 'idle') ||
      (fromGesture && miniActionRef.current !== 'opening')
    ) { return; }
    miniActionRef.current = 'opening';
    if (pendingActionTimerRef.current !== undefined) {
      window.clearTimeout(pendingActionTimerRef.current);
      pendingActionTimerRef.current = undefined;
    }
    const video = videoRef.current;
    if (
      video &&
      video.dataset.mediaId === currentDockedVideo.mediaId
    ) {
      updateDockedVideo({
        currentTime: video.currentTime,
        wasPlaying: !video.paused && !video.ended,
        muted: video.muted,
      });
    }
    requestDetailVideoRestore(currentDockedVideo.mediaId);
    if (getActiveDetailVideoMediaId() === currentDockedVideo.mediaId) {
      animate(miniScale, 1, { duration: 0.12, ease: 'easeOut' });
      miniActionRef.current = 'idle';
      return;
    }
    const openingMediaId = currentDockedVideo.mediaId;
    pendingActionTimerRef.current = window.setTimeout(() => {
      pendingActionTimerRef.current = undefined;
      if (
        miniActionRef.current === 'opening' &&
        getDockedVideo()?.mediaId === openingMediaId
      ) {
        miniActionRef.current = 'idle';
        animate(miniScale, 1, { duration: 0.12, ease: 'easeOut' });
      }
    }, 5000);
    // The persistent mini player keeps playing while the route payload loads;
    // MediaLarge claims the state only after the destination is mounted.
    router.push(currentDockedVideo.detailPath, { scroll: false });
  }, [miniScale, router]);
  useEffect(() => {
    // The source selection is local UI state that must reset with a new
    // media element; this is an intentional state synchronization boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUseFallbackSource(false);
    setPlaybackError(false);
    setControlsVisible(true);
    setIsPaused(!dockedVideo?.wasPlaying);
    setIsMuted(Boolean(dockedVideo?.muted));
    setCurrentTime(dockedVideo?.currentTime ?? 0);
    setDuration(0);
    scheduleControlsHide();
    handoffReadyMediaRef.current = undefined;
    resumeTimeRef.current = dockedVideo?.currentTime;
    // Playback time is updated continuously without changing the media
    // element; only a new media id should reset the source selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockedVideo?.mediaId, scheduleControlsHide]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !dockedVideo?.pendingHandoff) { return; }
    if (!video.paused) { signalHandoffReady(video); }
  }, [dockedVideo?.pendingHandoff, dockedVideo?.mediaId, signalHandoffReady]);

  useEffect(() => {
    const onHandoffReady = (event: Event) => {
      const mediaId = (event as CustomEvent<{ mediaId?: string }>).detail
        ?.mediaId;
      const latest = getDockedVideo();
      if (
        !latest ||
        latest.mediaId !== mediaId ||
        !latest.pendingHandoff
      ) { return; }
      if (videoRef.current) { videoRef.current.muted = latest.muted; }
      // The detail-side timeout can release the route even when autoplay is
      // blocked. Mark the ownership handoff complete so the mini is visible
      // and the user can start it normally from the origin page.
      updateDockedVideo({ pendingHandoff: false }, true);
    };
    window.addEventListener(PERSISTENT_VIDEO_HANDOFF_READY_EVENT, onHandoffReady);
    return () => window.removeEventListener(
      PERSISTENT_VIDEO_HANDOFF_READY_EVENT,
      onHandoffReady,
    );
  }, [dockedVideo?.mediaId]);

  const shouldResumePlayback = Boolean(dockedVideo?.wasPlaying);
  useEffect(() => {
    if (!source) { return; }
    const video = videoRef.current;
    if (!video) { return; }
    const restore = () => {
      const currentTime = resumeTimeRef.current;
      if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
        try { video.currentTime = Math.max(0, currentTime); }
        catch { /* media is still changing source */ }
      }
      if (shouldResumePlayback) {
        requestPlayback(video);
      }
    };
    if (video.readyState >= 1) { restore(); }
  }, [
    dockedVideo?.mediaId,
    requestPlayback,
    shouldResumePlayback,
    source,
    useFallbackSource,
  ]);

  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-site-header]');
    if (!header) { return; }
    const update = () => {
      const next = Math.max(0, Math.ceil(header.getBoundingClientRect().height));
      setHeaderHeight(current => current === next ? current : next);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(update);
    observer?.observe(header);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  const snapToCorner = useCallback((preferred?: 'tl' | 'tr' | 'bl' | 'br') => {
    const bounds = boundsRef.current?.getBoundingClientRect();
    const player = playerRef.current;
    if (!bounds || !player) { return; }
    const gap = window.innerWidth >= 640 ? 16 : 8;
    const playerWidth = player.offsetWidth;
    const playerHeight = player.offsetHeight;
    const baseLeft = bounds.width - playerWidth - gap;
    const baseTop = bounds.height - playerHeight - gap;
    const rect = player.getBoundingClientRect();
    const corner = preferred ?? [
      rect.left + rect.width / 2 < bounds.left + bounds.width / 2 ? 'l' : 'r',
      rect.top + rect.height / 2 < bounds.top + bounds.height / 2 ? 't' : 'b',
    ].reverse().join('') as 'tl' | 'tr' | 'bl' | 'br';
    cornerRef.current = corner;
    const targetX = corner.endsWith('l') ? gap - baseLeft : 0;
    const targetY = corner.startsWith('t') ? gap - baseTop : 0;
    animate(miniX, targetX, { type: 'spring', stiffness: 420, damping: 34 });
    animate(miniY, targetY, { type: 'spring', stiffness: 420, damping: 34 });
    animate(miniScale, 1, { type: 'spring', stiffness: 420, damping: 34 });
  }, [miniScale, miniX, miniY]);
  const onMiniDragStart = () => {
    if (miniActionRef.current !== 'idle') { return; }
    gestureSessionRef.current += 1;
    miniActionRef.current = 'dragging';
    miniGestureMovedRef.current = false;
  };
  const onMiniDrag = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (miniActionRef.current !== 'dragging') { return; }
    if (Math.hypot(info.offset.x, info.offset.y) > 6) {
      miniGestureMovedRef.current = true;
      suppressClickUntilRef.current = Date.now() + 360;
    }
    const isBottom = cornerRef.current.startsWith('b');
    const inwardDistance = isBottom ? -info.offset.y : info.offset.y;
    miniScale.set(1 + Math.min(0.12, Math.max(0, inwardDistance) / 900));
  };
  const onMiniDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (miniActionRef.current !== 'dragging') { return; }
    const session = gestureSessionRef.current;
    const corner = cornerRef.current;
    const isBottom = corner.startsWith('b');
    const isLeft = corner.endsWith('l');
    const inwardDistance = isBottom ? -info.offset.y : info.offset.y;
    const shouldUnfold = inwardDistance > 56 &&
      Math.abs(info.offset.y) > Math.abs(info.offset.x) * 1.1;
    const outwardX = isLeft ? -info.offset.x : info.offset.x;
    const outwardY = isBottom ? info.offset.y : -info.offset.y;
    const shouldDismiss = (
      outwardX > 88 && Math.abs(info.offset.x) > Math.abs(info.offset.y)
    ) || (
      outwardY > 88 && Math.abs(info.offset.y) > Math.abs(info.offset.x)
    );
    const didMove = miniGestureMovedRef.current;
    if (didMove) { suppressClickUntilRef.current = Date.now() + 360; }
    // The movement flag belongs to this pointer session only. Leaving it set
    // permanently disables every later tap that should reveal native video
    // controls.
    miniGestureMovedRef.current = false;
    if (shouldUnfold) {
      const mediaId = getDockedVideo()?.mediaId;
      miniActionRef.current = 'opening';
      animate(miniScale, 1.12, { duration: 0.12, ease: 'easeOut' });
      pendingActionTimerRef.current = window.setTimeout(() => {
        pendingActionTimerRef.current = undefined;
        if (
          session !== gestureSessionRef.current ||
          miniActionRef.current !== 'opening' ||
          getDockedVideo()?.mediaId !== mediaId
        ) { return; }
        openDetails(true);
      }, 90);
      return;
    }
    if (shouldDismiss) {
      const mediaId = getDockedVideo()?.mediaId;
      miniActionRef.current = 'dismissing';
      const bounds = boundsRef.current?.getBoundingClientRect();
      const player = playerRef.current;
      if (bounds && player) {
        const direction = Math.abs(info.offset.x) > Math.abs(info.offset.y)
          ? isLeft ? -1 : 1
          : isBottom ? 1 : -1;
        if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
          animate(miniX, miniX.get() + direction * (player.offsetWidth + 40), {
            duration: 0.16,
          });
        } else {
          animate(miniY, miniY.get() + direction * (player.offsetHeight + 40), {
            duration: 0.16,
          });
        }
        animate(miniScale, 0.88, { duration: 0.16 });
      }
      pendingActionTimerRef.current = window.setTimeout(() => {
        pendingActionTimerRef.current = undefined;
        if (
          session !== gestureSessionRef.current ||
          miniActionRef.current !== 'dismissing' ||
          getDockedVideo()?.mediaId !== mediaId
        ) { return; }
        videoRef.current?.pause();
        clearDockedVideo();
        miniActionRef.current = 'idle';
      }, 150);
      return;
    }
    miniActionRef.current = 'idle';
    snapToCorner();
  };

  useEffect(() => {
    gestureSessionRef.current += 1;
    miniActionRef.current = 'idle';
    miniGestureMovedRef.current = false;
    suppressClickUntilRef.current = 0;
    if (pendingActionTimerRef.current !== undefined) {
      window.clearTimeout(pendingActionTimerRef.current);
      pendingActionTimerRef.current = undefined;
    }
    cornerRef.current = 'br';
    miniX.set(0);
    miniY.set(0);
    miniScale.set(1);
  }, [dockedVideo?.mediaId, miniScale, miniX, miniY]);

  useEffect(() => {
    const recover = () => {
      if (document.hidden || !dockedVideo) { return; }
      // Browsers can suspend a pointer sequence and throttle its completion
      // timer while the screen is locked. Invalidate that abandoned session
      // so the player never returns permanently locked in opening/dismissing.
      gestureSessionRef.current += 1;
      miniActionRef.current = 'idle';
      miniGestureMovedRef.current = false;
      suppressClickUntilRef.current = 0;
      if (pendingActionTimerRef.current !== undefined) {
        window.clearTimeout(pendingActionTimerRef.current);
        pendingActionTimerRef.current = undefined;
      }
      window.requestAnimationFrame(() => snapToCorner(cornerRef.current));
      const video = videoRef.current;
      if (!video) { return; }
      const restorePlayback = () => {
        const latest = getDockedVideo();
        if (!latest || latest.mediaId !== dockedVideo.mediaId) { return; }
        try { video.currentTime = Math.max(0, latest.currentTime); } catch {}
        if (latest.wasPlaying) { requestPlayback(video); }
      };
      if (
        video.error ||
        video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
      ) {
        video.addEventListener('loadedmetadata', restorePlayback, { once: true });
        try { video.load(); } catch {}
      } else if (video.paused && dockedVideo.wasPlaying) {
        restorePlayback();
      }
    };
    const onVisibility = () => {
      if (!document.hidden) { recover(); }
    };
    window.addEventListener('pageshow', recover);
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', recover);
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dockedVideo, requestPlayback, snapToCorner]);

  useEffect(() => () => {
    if (pendingActionTimerRef.current !== undefined) {
      window.clearTimeout(pendingActionTimerRef.current);
    }
    if (controlsTimerRef.current !== undefined) {
      window.clearTimeout(controlsTimerRef.current);
    }
  }, []);

  return (
    <div
      ref={boundsRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40"
      style={{ top: headerHeight, visibility: 'visible' }}
    >
      <AnimatePresence>
        {dockedVideo && source &&
          <motion.aside
          ref={playerRef}
          data-video-mini-player
          data-media-id={dockedVideo.mediaId}
          key={dockedVideo.mediaId}
          aria-label="Playing video"
            className="pointer-events-auto absolute bottom-2 right-2
            w-[min(17rem,calc(100vw-1rem))] overflow-hidden rounded-lg
            border border-white/15 bg-black shadow-2xl ring-1 ring-black/30
            will-change-transform sm:bottom-4 sm:right-4"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          drag
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={boundsRef}
          dragElastic={0.04}
          dragMomentum={false}
          style={{
            x: miniX,
            y: miniY,
            scale: miniScale,
            // During a detail-title fold the page-owned video is the visible
            // object. Keep this element mounted and playing for handoff, but
            // do not expose a second floating player over the shrinking page.
            visibility: isPendingDetailFold || isDetailPlayerVisible
              ? 'hidden'
              : 'visible',
          }}
          onDragStart={onMiniDragStart}
          onDrag={onMiniDrag}
          onDragEnd={onMiniDragEnd}
          >
          <div className="relative aspect-video overflow-hidden bg-black">
            <video
              ref={videoRef}
              data-media-id={dockedVideo.mediaId}
              key={`${dockedVideo.mediaId}-${source}`}
              className="size-full object-contain"
              src={source}
              poster={dockedVideo.posterUrl}
              playsInline
              autoPlay={dockedVideo.wasPlaying}
              muted={dockedVideo.pendingHandoff ? true : dockedVideo.muted}
              preload="auto"
              onLoadedMetadata={event => {
                const currentTime = resumeTimeRef.current;
                if (
                  typeof currentTime === 'number' &&
                  Number.isFinite(currentTime)
                ) {
                  try {
                    event.currentTarget.currentTime = Math.max(0, currentTime);
                  }
                  catch { /* media is still changing source */ }
                }
                setPlaybackError(false);
                setDuration(Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : 0);
                setCurrentTime(event.currentTarget.currentTime || 0);
                setIsMuted(event.currentTarget.muted);
                setIsPaused(event.currentTarget.paused);
                if (dockedVideo.wasPlaying) {
                  requestPlayback(event.currentTarget);
                }
              }}
              onTimeUpdate={event => {
                const currentTime = event.currentTarget.currentTime;
                resumeTimeRef.current = currentTime;
                setCurrentTime(currentTime);
                updateDockedVideo({ currentTime });
              }}
              onPlay={() => {
                setIsPaused(false);
                updateDockedVideo({ wasPlaying: true }, true);
                const video = videoRef.current;
                if (video) { signalHandoffReady(video); }
              }}
              onPlaying={event => {
                signalHandoffReady(event.currentTarget);
              }}
              onPause={event => {
                const currentTime = event.currentTarget.currentTime;
                resumeTimeRef.current = currentTime;
                setCurrentTime(currentTime);
                setIsPaused(true);
                // Mobile browsers pause media while locking/backgrounding the
                // page. Preserve the user's playing intent in that lifecycle
                // pause so visibility recovery can resume without a refresh.
                updateDockedVideo({
                  currentTime,
                  ...!document.hidden && { wasPlaying: false },
                }, !document.hidden);
              }}
              onVolumeChange={event => {
                setIsMuted(event.currentTarget.muted);
                updateDockedVideo({ muted: event.currentTarget.muted }, true);
              }}
              onDurationChange={event => {
                setDuration(Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : 0);
              }}
              onEnded={() => {
                setIsPaused(true);
                updateDockedVideo({ wasPlaying: false }, true);
                showControls();
              }}
              onError={() => {
                const video = videoRef.current;
                const currentTime = video?.currentTime;
                if (
                  video &&
                  typeof currentTime === 'number' &&
                  Number.isFinite(currentTime)
                ) {
                  resumeTimeRef.current = currentTime;
                  updateDockedVideo({ currentTime });
                }
                if (
                  dockedVideo.fallbackUrl &&
                  source !== dockedVideo.fallbackUrl
                ) {
                  setPlaybackError(false);
                  setUseFallbackSource(true);
                  return;
                }
                setPlaybackError(true);
              }}
            />
            <div
              aria-label="Mini-player gesture surface"
              role="button"
              tabIndex={0}
              className="absolute inset-0 z-[5] cursor-grab touch-none
                active:cursor-grabbing"
              onPointerDown={event => {
                if (miniActionRef.current !== 'idle') {
                  event.preventDefault();
                  return;
                }
                dragControls.start(event);
              }}
              onClick={toggleControls}
              onDoubleClick={event => {
                event.preventDefault();
                if (Date.now() < suppressClickUntilRef.current) { return; }
                openDetails();
              }}
              onPointerCancel={() => {
                if (miniActionRef.current !== 'dragging') { return; }
                gestureSessionRef.current += 1;
                miniActionRef.current = 'idle';
                miniGestureMovedRef.current = false;
                suppressClickUntilRef.current = Date.now() + 120;
                snapToCorner();
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ' ||
                  event.key === 'ArrowUp') {
                  event.preventDefault();
                  if (event.key === 'ArrowUp') {
                    openDetails();
                  } else {
                    toggleControls();
                  }
                }
              }}
            />
            <div
              className={`absolute inset-x-0 bottom-0 z-10 px-2 pb-1.5 pt-6
                transition-opacity duration-150 bg-gradient-to-t
                from-black/85 via-black/45 to-transparent
                ${controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              onPointerDown={event => {
                event.stopPropagation();
                showControls();
              }}
              onClick={event => event.stopPropagation()}
            >
              <input
                aria-label="Seek video"
                className="mb-1 block h-1 w-full cursor-pointer accent-white"
                type="range"
                min={0}
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                onChange={event => {
                  const nextTime = Number(event.currentTarget.value);
                  const video = videoRef.current;
                  if (!video || !Number.isFinite(nextTime)) { return; }
                  video.currentTime = nextTime;
                  resumeTimeRef.current = nextTime;
                  setCurrentTime(nextTime);
                  updateDockedVideo({ currentTime: nextTime });
                  showControls();
                }}
              />
              <div className="flex items-center gap-0.5 text-white">
                <button
                  type="button"
                  aria-label={isPaused ? 'Play' : 'Pause'}
                  className="flex size-7 items-center justify-center rounded-full
                    bg-white/10 transition-colors hover:bg-white/20"
                  onClick={togglePlayback}
                >
                  {isPaused ? <LuPlay size={15} /> : <LuPause size={15} />}
                </button>
                <button
                  type="button"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="flex size-7 items-center justify-center rounded-full
                    transition-colors hover:bg-white/15"
                  onClick={toggleMuted}
                >
                  {isMuted ? <LuVolumeX size={15} /> : <LuVolume2 size={15} />}
                </button>
                <span className="min-w-0 flex-1 px-1 text-[10px] tabular-nums
                  text-white/80">
                  {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
                </span>
                <button
                  type="button"
                  aria-label="Fullscreen"
                  className="flex size-7 items-center justify-center rounded-full
                    transition-colors hover:bg-white/15"
                  onClick={enterFullscreen}
                >
                  <LuMaximize size={15} />
                </button>
              </div>
            </div>
            {playbackError && (
              <div className="absolute inset-0 z-10 flex items-center
                justify-center bg-black/75 px-3 text-center text-xs text-white">
                Video unavailable. Open the media details to retry.
              </div>
            )}
          </div>
        </motion.aside>}
      </AnimatePresence>
    </div>
  );
}
