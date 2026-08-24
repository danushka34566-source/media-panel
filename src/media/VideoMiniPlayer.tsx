'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx/lite';
import { LuMaximize2, LuMinimize2, LuPlay, LuX } from 'react-icons/lu';
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
  subscribeVideoMiniPlayer,
  updateDockedVideo,
  clearDockedVideo,
  PERSISTENT_VIDEO_FULLSCREEN_EVENT,
  PERSISTENT_VIDEO_PIP_EVENT,
} from './video-mini-player';

export default function VideoMiniPlayer() {
  const router = useRouter();
  const pathname = usePathname();
  const boundsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeTimeRef = useRef<number | undefined>(undefined);
  const dockedVideo = useSyncExternalStore(
    subscribeVideoMiniPlayer,
    getDockedVideo,
    getDockedVideoServerSnapshot,
  );
  const [useFallbackSource, setUseFallbackSource] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackNeedsGesture, setPlaybackNeedsGesture] = useState(false);
  const [fullscreenMediaId, setFullscreenMediaId] = useState<string>();
  const [hostRect, setHostRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  }>();
  const source = dockedVideo && useFallbackSource && dockedVideo.fallbackUrl
    ? dockedVideo.fallbackUrl
    : dockedVideo?.sourceUrl;
  const isFullscreen = Boolean(
    dockedVideo && fullscreenMediaId === dockedVideo.mediaId,
  );
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
    // The persistent mini player keeps playing while the route payload loads;
    // MediaLarge claims the state only after the destination is mounted.
    router.push(dockedVideo.detailPath, { scroll: false });
  }, [dockedVideo, router]);
  const onDragEnd = useCallback((
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (info.offset.y < -72 || info.velocity.y < -650) { openDetails(); }
  }, [openDetails]);

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

  useEffect(() => {
    const requestFullscreen = (event: Event) => {
      const mediaId = (event as CustomEvent<{ mediaId?: string }>).detail
        ?.mediaId;
      if (mediaId) { setFullscreenMediaId(mediaId); }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setFullscreenMediaId(undefined); }
    };
    const requestPictureInPicture = (event: Event) => {
      const mediaId = (event as CustomEvent<{ mediaId?: string }>).detail
        ?.mediaId;
      const video = videoRef.current;
      if (mediaId && video?.dataset.mediaId === mediaId) {
        void VideoPlaybackManager.togglePiP(video);
      }
    };
    window.addEventListener(
      PERSISTENT_VIDEO_FULLSCREEN_EVENT,
      requestFullscreen,
    );
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(
      PERSISTENT_VIDEO_PIP_EVENT,
      requestPictureInPicture,
    );
    return () => {
      window.removeEventListener(
        PERSISTENT_VIDEO_FULLSCREEN_EVENT,
        requestFullscreen,
      );
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(
        PERSISTENT_VIDEO_PIP_EVENT,
        requestPictureInPicture,
      );
    };
  }, []);

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
    const mediaId = dockedVideo?.mediaId;
    if (!mediaId) {
      setHostRect(undefined);
      return;
    }
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const hosts = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-persistent-video-host]',
      )).filter(host => host.dataset.persistentVideoHost === mediaId);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const best = hosts.map(host => {
        const rect = host.getBoundingClientRect();
        const visibleWidth = Math.max(
          0,
          Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
        );
        const visibleHeight = Math.max(
          0,
          Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
        );
        return { rect, visibleArea: visibleWidth * visibleHeight };
      }).sort((a, b) => b.visibleArea - a.visibleArea)[0];
      const visibleRatio = best && best.rect.width > 0 && best.rect.height > 0
        ? best.visibleArea / (best.rect.width * best.rect.height)
        : 0;
      if (!best || visibleRatio < 0.2) {
        setHostRect(undefined);
        return;
      }
      const next = {
        left: best.rect.left,
        top: best.rect.top,
        width: best.rect.width,
        height: best.rect.height,
      };
      setHostRect(current => current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.height - next.height) < 0.5
        ? current
        : next);
    };
    const scheduleUpdate = () => {
      if (frame === undefined) { frame = requestAnimationFrame(update); }
    };
    update();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(scheduleUpdate);
    document.querySelectorAll<HTMLElement>('[data-persistent-video-host]')
      .forEach(host => resizeObserver?.observe(host));
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      if (frame !== undefined) { cancelAnimationFrame(frame); }
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [dockedVideo?.mediaId, pathname]);

  const isEmbedded = Boolean(hostRect) && !isFullscreen;

  return (
    <div
      ref={boundsRef}
      className="pointer-events-none fixed inset-0 z-40"
    >
      <AnimatePresence>
        {dockedVideo && source &&
        <motion.aside
          key={dockedVideo.mediaId}
          aria-label="Playing video"
          className={clsx(
            'pointer-events-auto absolute overflow-hidden',
            isFullscreen
              ? 'inset-0 rounded-none border-0 bg-black'
              : isEmbedded
              ? 'rounded-md'
              : clsx(
                'bottom-2 right-2 rounded-xl sm:bottom-4 sm:right-4',
                'w-[min(19rem,calc(100vw-1rem))]',
              ),
            'border border-medium bg-main shadow-2xl ring-1 ring-black/15',
            'will-change-transform',
          )}
          style={isEmbedded && hostRect ? {
            left: hostRect.left,
            top: hostRect.top,
            width: hostRect.width,
            height: hostRect.height,
          } : undefined}
          layout
          initial={{ opacity: 0, scale: 0.9, y: 28 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          drag={!isEmbedded && !isFullscreen}
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={boundsRef}
          dragElastic={0.06}
          dragMomentum={false}
          onDragEnd={onDragEnd}
        >
          <div className={clsx(
            'relative overflow-hidden bg-black',
            isEmbedded || isFullscreen ? 'size-full' : 'aspect-video',
          )}>
            <video
              ref={videoRef}
              data-media-id={dockedVideo.mediaId}
              key={`${dockedVideo.mediaId}-${source}`}
              className="size-full object-contain"
              src={source}
              poster={dockedVideo.posterUrl}
              controls
              playsInline
              autoPlay={dockedVideo.wasPlaying}
              muted={dockedVideo.muted}
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
            {isFullscreen && (
              <button
                type="button"
                aria-label="Exit full screen"
                title="Exit full screen"
                className="absolute right-3 top-3 z-20 inline-flex size-10
                  items-center justify-center rounded-full border border-white/25
                  bg-black/70 text-white shadow-lg backdrop-blur-sm
                  transition-transform hover:scale-105"
                onClick={() => setFullscreenMediaId(undefined)}
              >
                <LuMinimize2 size={18} />
              </button>
            )}
          </div>
          {!isEmbedded && !isFullscreen && <div
            className="flex min-h-12 touch-none select-none items-center gap-2
              border-t border-medium bg-main px-2.5 py-2 cursor-grab
              active:cursor-grabbing"
            onPointerDown={event => {
              const target = event.target as HTMLElement;
              if (!target.closest('button')) { dragControls.start(event); }
            }}
            onDoubleClick={openDetails}
          >
            <button
              type="button"
              onClick={openDetails}
              className="min-w-0 grow text-left"
              aria-label={`Open details for ${dockedVideo.title || 'playing video'}`}
            >
              <span className="block truncate text-xs font-medium text-main">
                {dockedVideo.title || 'Playing video'}
              </span>
              <span className="block text-[10px] text-dim">
                Swipe up to open
              </span>
            </button>
            <button
              type="button"
              onClick={openDetails}
              aria-label="Open video details"
              className="inline-flex size-8 shrink-0 items-center justify-center
                rounded-md text-main hover:bg-dim"
            >
              <LuMaximize2 size={15} />
            </button>
            <button
              type="button"
              aria-label="Close mini player"
              title="Close mini player"
              className="inline-flex size-8 shrink-0 items-center justify-center
                rounded-md text-main hover:bg-dim"
              onClick={() => {
                videoRef.current?.pause();
                clearDockedVideo();
              }}
            >
              <LuX size={16} />
            </button>
          </div>}
        </motion.aside>}
      </AnimatePresence>
    </div>
  );
}
