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
  getDockedVideo,
  getDockedVideoServerSnapshot,
  getActiveDetailVideoMediaId,
  subscribeVideoMiniPlayer,
  updateDockedVideo,
  clearDockedVideo,
  requestDetailVideoRestore,
  PERSISTENT_VIDEO_HANDOFF_READY_EVENT,
} from './video-mini-player';

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
  const suppressClickUntilRef = useRef(0);
  const pendingActionTimerRef = useRef<number | undefined>(undefined);
  const handoffReadyMediaRef = useRef<string | undefined>(undefined);
  const controlsTimerRef = useRef<number | undefined>(undefined);
  const resumeTimeRef = useRef<number | undefined>(undefined);
  const dockedVideo = useSyncExternalStore(
    subscribeVideoMiniPlayer,
    getDockedVideo,
    getDockedVideoServerSnapshot,
  );
  const [useFallbackSource, setUseFallbackSource] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(false);
  const source = dockedVideo && useFallbackSource && dockedVideo.fallbackUrl
    ? dockedVideo.fallbackUrl
    : dockedVideo?.sourceUrl;
  const requestPlayback = useCallback((video: HTMLVideoElement) => {
    void VideoPlaybackManager.requestPlay(video).catch(() => undefined);
  }, []);
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
    window.dispatchEvent(new CustomEvent(
      PERSISTENT_VIDEO_HANDOFF_READY_EVENT,
      { detail: { mediaId } },
    ));
    video.muted = latest.muted;
    updateDockedVideo({ pendingHandoff: false, muted: latest.muted });
  }, []);
  const openDetails = useCallback(() => {
    if (!dockedVideo || miniActionRef.current === 'dismissing') { return; }
    miniActionRef.current = 'opening';
    if (pendingActionTimerRef.current !== undefined) {
      window.clearTimeout(pendingActionTimerRef.current);
      pendingActionTimerRef.current = undefined;
    }
    const video = videoRef.current;
    if (video) {
      updateDockedVideo({
        currentTime: video.currentTime,
        wasPlaying: !video.paused && !video.ended,
        muted: video.muted,
      });
    }
    requestDetailVideoRestore(dockedVideo.mediaId);
    if (getActiveDetailVideoMediaId() === dockedVideo.mediaId) {
      miniActionRef.current = 'idle';
      return;
    }
    // The persistent mini player keeps playing while the route payload loads;
    // MediaLarge claims the state only after the destination is mounted.
    router.push(dockedVideo.detailPath, { scroll: false });
  }, [dockedVideo, router]);
  useEffect(() => {
    // The source selection is local UI state that must reset with a new
    // media element; this is an intentional state synchronization boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUseFallbackSource(false);
    setPlaybackError(false);
    handoffReadyMediaRef.current = undefined;
    resumeTimeRef.current = dockedVideo?.currentTime;
    // Playback time is updated continuously without changing the media
    // element; only a new media id should reset the source selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockedVideo?.mediaId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !dockedVideo?.pendingHandoff) { return; }
    if (!video.paused) { signalHandoffReady(video); }
  }, [dockedVideo?.pendingHandoff, dockedVideo?.mediaId, signalHandoffReady]);

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
  const scheduleControlsHide = useCallback(() => {
    if (controlsTimerRef.current !== undefined) {
      window.clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 3200);
  }, []);
  const toggleControls = useCallback(() => {
    if (
      miniGestureMovedRef.current ||
      miniActionRef.current !== 'idle' ||
      Date.now() < suppressClickUntilRef.current
    ) { return; }
    setControlsVisible(current => {
      const next = !current;
      if (next) { scheduleControlsHide(); }
      return next;
    });
  }, [scheduleControlsHide]);
  const onMiniDragStart = () => {
    if (miniActionRef.current !== 'idle') { return; }
    miniActionRef.current = 'dragging';
    miniGestureMovedRef.current = false;
    if (controlsTimerRef.current !== undefined) {
      window.clearTimeout(controlsTimerRef.current);
    }
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
    if (shouldUnfold) {
      miniActionRef.current = 'opening';
      animate(miniScale, 1.12, { duration: 0.12, ease: 'easeOut' });
      pendingActionTimerRef.current = window.setTimeout(() => {
        pendingActionTimerRef.current = undefined;
        openDetails();
      }, 90);
      return;
    }
    if (shouldDismiss) {
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
        videoRef.current?.pause();
        clearDockedVideo();
      }, 150);
      return;
    }
    miniActionRef.current = 'idle';
    snapToCorner();
    if (controlsVisible) { scheduleControlsHide(); }
  };

  useEffect(() => {
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
    // A new media session starts with the unobstructed minimal player.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setControlsVisible(false);
  }, [dockedVideo?.mediaId, miniScale, miniX, miniY]);

  useEffect(() => {
    const recover = () => {
      if (document.hidden || !dockedVideo) { return; }
      setControlsVisible(false);
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
      style={{ top: headerHeight }}
    >
      <AnimatePresence>
        {dockedVideo && source &&
          <motion.aside
          ref={playerRef}
          data-video-mini-player
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
          style={{ x: miniX, y: miniY, scale: miniScale }}
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
              controls={controlsVisible}
              controlsList="nodownload noplaybackrate"
              playsInline
              autoPlay={dockedVideo.wasPlaying}
              muted={dockedVideo.pendingHandoff ? true : dockedVideo.muted}
              preload="auto"
              onContextMenu={event => event.preventDefault()}
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
                if (dockedVideo.wasPlaying) {
                  requestPlayback(event.currentTarget);
                }
              }}
              onTimeUpdate={event => {
                const currentTime = event.currentTarget.currentTime;
                resumeTimeRef.current = currentTime;
                updateDockedVideo({ currentTime });
              }}
              onPlay={() => {
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
                updateDockedVideo({ currentTime, wasPlaying: false }, true);
              }}
              onVolumeChange={event => {
                updateDockedVideo({ muted: event.currentTarget.muted });
              }}
              onEnded={() => updateDockedVideo({ wasPlaying: false }, true)}
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
              className={`absolute inset-x-0 top-0 z-[5] cursor-grab touch-none
                active:cursor-grabbing ${controlsVisible ? 'h-8' : 'bottom-0'}`}
              onPointerDown={event => {
                if (miniActionRef.current !== 'idle') {
                  event.preventDefault();
                  return;
                }
                dragControls.start(event);
              }}
              onClick={toggleControls}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleControls();
                } else if (event.key === 'ArrowUp') {
                  openDetails();
                }
              }}
            />
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
