'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import { LuMaximize2, LuPlay, LuX } from 'react-icons/lu';
import {
  AnimatePresence,
  motion,
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
} from './video-mini-player';

export default function VideoMiniPlayer() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const miniSwipeStartYRef = useRef<number | undefined>(undefined);
  const resumeTimeRef = useRef<number | undefined>(undefined);
  const dockedVideo = useSyncExternalStore(
    subscribeVideoMiniPlayer,
    getDockedVideo,
    getDockedVideoServerSnapshot,
  );
  const [useFallbackSource, setUseFallbackSource] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackNeedsGesture, setPlaybackNeedsGesture] = useState(false);
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

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40"
    >
      <AnimatePresence>
        {dockedVideo && source &&
        <motion.aside
          key={dockedVideo.mediaId}
          aria-label="Playing video"
          className="pointer-events-auto absolute bottom-2 right-2
            w-[min(19rem,calc(100vw-1rem))] overflow-hidden rounded-xl
            border border-medium bg-main shadow-2xl ring-1 ring-black/15
            will-change-transform sm:bottom-4 sm:right-4"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
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
          </div>
          <div
            className="flex min-h-12 touch-pan-y select-none items-center gap-2
              border-t border-medium bg-main px-2.5 py-2"
            onTouchStart={event => {
              miniSwipeStartYRef.current = event.touches.length === 1
                ? event.touches[0].clientY
                : undefined;
            }}
            onTouchEnd={event => {
              const startY = miniSwipeStartYRef.current;
              miniSwipeStartYRef.current = undefined;
              const endY = event.changedTouches[0]?.clientY;
              if (
                typeof startY === 'number' &&
                typeof endY === 'number' &&
                endY - startY < -56
              ) {
                openDetails();
              }
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
          </div>
        </motion.aside>}
      </AnimatePresence>
    </div>
  );
}
