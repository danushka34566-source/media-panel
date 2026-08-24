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
import { LuMaximize2, LuPlay, LuX } from 'react-icons/lu';
import {
  AnimatePresence,
  motion,
  type PanInfo,
  useDragControls,
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
  const dragControls = useDragControls();
  const videoRef = useRef<HTMLVideoElement>(null);
  const miniGestureMovedRef = useRef(false);
  const resumeTimeRef = useRef<number | undefined>(undefined);
  const dockedVideo = useSyncExternalStore(
    subscribeVideoMiniPlayer,
    getDockedVideo,
    getDockedVideoServerSnapshot,
  );
  const [useFallbackSource, setUseFallbackSource] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackNeedsGesture, setPlaybackNeedsGesture] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const source = dockedVideo && useFallbackSource && dockedVideo.fallbackUrl
    ? dockedVideo.fallbackUrl
    : dockedVideo?.sourceUrl;
  const requestPlayback = useCallback((video: HTMLVideoElement) => {
    void VideoPlaybackManager.requestPlay(video)
      .then(() => setPlaybackNeedsGesture(video.paused && !video.ended))
      .catch(() => setPlaybackNeedsGesture(true));
  }, []);
  const openDetails = useCallback(() => {
    if (!dockedVideo) { return; }
    const video = videoRef.current;
    if (video) {
      updateDockedVideo({
        currentTime: video.currentTime,
        wasPlaying: !video.paused && !video.ended,
        muted: video.muted,
      });
    }
    requestDetailVideoRestore(dockedVideo.mediaId);
    if (getActiveDetailVideoMediaId() === dockedVideo.mediaId) { return; }
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
    setPlaybackNeedsGesture(false);
    resumeTimeRef.current = dockedVideo?.currentTime;
    // Playback time is updated continuously without changing the media
    // element; only a new media id should reset the source selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const onMiniDragStart = () => {
    miniGestureMovedRef.current = false;
  };
  const onMiniDrag = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (Math.hypot(info.offset.x, info.offset.y) > 6) {
      miniGestureMovedRef.current = true;
    }
  };
  const onMiniDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const shouldUnfold = info.offset.y < -56 &&
      Math.abs(info.offset.y) > Math.abs(info.offset.x) * 1.15;
    window.setTimeout(() => { miniGestureMovedRef.current = false; }, 0);
    if (shouldUnfold) { openDetails(); }
  };

  return (
    <div
      ref={boundsRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40"
      style={{ top: headerHeight }}
    >
      <AnimatePresence>
        {dockedVideo && source &&
        <motion.aside
          key={dockedVideo.mediaId}
          aria-label="Playing video"
          className="pointer-events-auto absolute bottom-2 right-2
            w-[min(17rem,calc(100vw-1rem))] overflow-hidden rounded-lg
            border border-white/15 bg-black shadow-2xl ring-1 ring-black/30
            will-change-transform sm:bottom-4 sm:right-4"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          drag
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={boundsRef}
          dragElastic={0.04}
          dragMomentum={false}
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
              controls
              controlsList="nodownload noplaybackrate nofullscreen"
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
                setPlaybackNeedsGesture(false);
                updateDockedVideo({ wasPlaying: true }, true);
              }}
              onPlaying={event => {
                if (!dockedVideo.pendingHandoff) { return; }
                window.dispatchEvent(new CustomEvent(
                  PERSISTENT_VIDEO_HANDOFF_READY_EVENT,
                  { detail: { mediaId: dockedVideo.mediaId } },
                ));
                event.currentTarget.muted = dockedVideo.muted;
                updateDockedVideo({
                  pendingHandoff: false,
                  muted: dockedVideo.muted,
                });
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
              aria-label="Move mini player; swipe up to unfold"
              role="button"
              tabIndex={0}
              className="absolute inset-x-0 top-0 bottom-10 z-[5]
                cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={event => dragControls.start(event)}
              onClick={() => {
                if (!miniGestureMovedRef.current) { openDetails(); }
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
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
            {playbackNeedsGesture && !playbackError && dockedVideo.wasPlaying && (
              <div className="pointer-events-none absolute inset-0 z-10 grid
                place-items-center">
                <button
                  type="button"
                  aria-label="Continue playback"
                  className="pointer-events-auto inline-flex size-9 items-center
                    justify-center rounded-full border border-white/30 bg-black/80
                    text-white shadow-lg backdrop-blur-sm transition-transform
                    hover:scale-105 focus-visible:outline-2
                    focus-visible:outline-white"
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) { return; }
                    requestPlayback(video);
                  }}
                >
                  <LuPlay size={16} fill="currentColor" />
                </button>
              </div>
            )}
            <button
              type="button"
              aria-label="Unfold video player"
              title="Unfold video player"
              className="absolute bottom-1.5 right-1.5 z-20 inline-flex size-7
                items-center justify-center rounded-sm bg-black/75 text-white
                backdrop-blur-sm transition-colors hover:bg-black
                focus-visible:outline-2 focus-visible:outline-white"
              onClick={openDetails}
            >
              <LuMaximize2 size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Close mini player"
              title="Close mini player"
              className="absolute right-1.5 top-1.5 z-20 inline-flex size-7
                items-center justify-center rounded-full border border-white/25
                bg-black/80 text-white shadow-md backdrop-blur-sm
                transition-colors hover:bg-black focus-visible:outline-2
                focus-visible:outline-white"
              onClick={() => {
                videoRef.current?.pause();
                clearDockedVideo();
              }}
            >
              <LuX size={14} strokeWidth={2.25} />
            </button>
          </div>
        </motion.aside>}
      </AnimatePresence>
    </div>
  );
}
