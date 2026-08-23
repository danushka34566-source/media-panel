'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx/lite';
import { LuMaximize2, LuX } from 'react-icons/lu';
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

  useEffect(() => {
    // The source selection is local UI state that must reset with a new
    // media element; this is an intentional state synchronization boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUseFallbackSource(false);
    resumeTimeRef.current = dockedVideo?.currentTime;
  }, [dockedVideo?.currentTime, dockedVideo?.mediaId]);

  useEffect(() => {
    if (!dockedVideo || detailPageActive) { return; }
    const video = videoRef.current;
    if (!video) { return; }
    const restore = () => {
      const currentTime = resumeTimeRef.current;
      if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
        try { video.currentTime = Math.max(0, currentTime); } catch { /* media is still changing source */ }
      }
      if (dockedVideo.wasPlaying) {
        void VideoPlaybackManager.requestPlay(video).catch(() => undefined);
      }
    };
    video.addEventListener('loadedmetadata', restore, { once: true });
    if (video.readyState >= 1) { restore(); }
    return () => video.removeEventListener('loadedmetadata', restore);
  }, [dockedVideo, detailPageActive, useFallbackSource]);

  if (!dockedVideo || detailPageActive) { return null; }

  const source = useFallbackSource && dockedVideo.fallbackUrl
    ? dockedVideo.fallbackUrl
    : dockedVideo.sourceUrl;

  return (
    <aside
      aria-label="Playing video"
      className={clsx(
        'fixed z-[900] right-3 bottom-3 sm:right-5 sm:bottom-5',
        'w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg',
        'border border-medium bg-black shadow-2xl ring-1 ring-black/20',
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
          onTimeUpdate={event => {
            updateDockedVideo({ currentTime: event.currentTarget.currentTime });
          }}
          onPlay={() => updateDockedVideo({ wasPlaying: true }, true)}
          onPause={event => updateDockedVideo({
            currentTime: event.currentTarget.currentTime,
            wasPlaying: false,
          }, true)}
          onEnded={() => updateDockedVideo({ wasPlaying: false }, true)}
          onError={() => {
            if (dockedVideo.fallbackUrl && !useFallbackSource) {
              setUseFallbackSource(true);
            }
          }}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-1.5 pointer-events-none">
          <button
            type="button"
            className="pointer-events-auto inline-flex min-w-0 max-w-[75%] items-center rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm"
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
          >
            <span className="truncate">{dockedVideo.title || 'Open video'}</span>
            <LuMaximize2 className="ml-1.5 shrink-0" size={13} />
          </button>
          <button
            type="button"
            aria-label="Close mini player"
            className="pointer-events-auto inline-flex size-7 shrink-0 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
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
