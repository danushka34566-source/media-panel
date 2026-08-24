'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx/lite';
import { LuMaximize2, LuPlay, LuX } from 'react-icons/lu';
import { VideoPlaybackManager } from '@/utility/VideoPlaybackManager';
import {
  getDockedVideo,
  getDockedVideoServerSnapshot,
  isDetailVideoPageActive,
  subscribeVideoMiniPlayer,
  updateDockedVideo,
  clearDockedVideo,
} from './video-mini-player';

export default function VideoMiniPlayer() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeTimeRef = useRef<number | undefined>(undefined);
  const dockedVideo = useSyncExternalStore(
    subscribeVideoMiniPlayer,
    getDockedVideo,
    getDockedVideoServerSnapshot,
  );
  const detailPageActive = useSyncExternalStore(
    subscribeVideoMiniPlayer,
    isDetailVideoPageActive,
    () => false,
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
    if (!source || detailPageActive) { return; }
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
    detailPageActive,
    requestPlayback,
    shouldResumePlayback,
    source,
    useFallbackSource,
  ]);

  if (!dockedVideo || detailPageActive || !source) { return null; }

  return (
    <aside
      aria-label="Playing video"
      className={clsx(
        'fixed right-2 z-40 sm:right-4 sm:bottom-4',
        'bottom-[max(0.5rem,env(safe-area-inset-bottom))]',
        'w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-md',
        'border border-medium bg-black shadow-xl ring-1 ring-black/20',
      )}
    >
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
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
            if (dockedVideo.fallbackUrl && source !== dockedVideo.fallbackUrl) {
              setPlaybackError(false);
              setUseFallbackSource(true);
              return;
            }
            setPlaybackError(true);
          }}
        />
        {playbackError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center
            bg-black/75 px-3 text-center text-xs text-white">
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
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex
          items-center justify-between gap-1 bg-gradient-to-b from-black/70
          to-transparent p-1.5">
          <button
            type="button"
            className="pointer-events-auto inline-flex min-w-0 max-w-[78%]
              items-center rounded-md border border-white/25 bg-black/75 px-2
              py-1 text-[0.7rem] font-medium leading-4 text-white shadow-sm
              backdrop-blur-sm transition-colors hover:bg-black/90
              focus-visible:outline-2 focus-visible:outline-white"
            onClick={() => {
              const video = videoRef.current;
              if (video) {
                updateDockedVideo({
                  currentTime: video.currentTime,
                  wasPlaying: !video.paused && !video.ended,
                });
              }
              // Keep the state until the detail page claims it. This avoids a
              // race where the route transition unmounts the mini player
              // before the new page can restore the playback position.
              router.push(dockedVideo.detailPath, { scroll: false });
            }}
            title="Open video details"
            aria-label={`Open details for ${
              dockedVideo.title || 'playing video'
            }`}
          >
            <span className="truncate">
              {dockedVideo.title || 'Open video'}
            </span>
            <LuMaximize2 className="ml-1.5 shrink-0" size={13} />
          </button>
          <button
            type="button"
            aria-label="Close mini player"
            title="Close mini player"
            className="pointer-events-auto inline-flex size-7 shrink-0
              items-center justify-center rounded-md border border-white/25
              bg-black/75 text-white shadow-sm backdrop-blur-sm
              transition-colors hover:bg-black/90
              focus-visible:outline-2 focus-visible:outline-white"
            onClick={() => {
              videoRef.current?.pause();
              clearDockedVideo();
            }}
          >
            <LuX size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
