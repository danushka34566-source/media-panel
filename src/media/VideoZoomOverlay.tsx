'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { LuX } from 'react-icons/lu';
import { selectRetryVideoPlaybackUrl } from './compatibility-playback';
import { getFullVideoBridgeUrl } from './full-video-bridge';
import {
  useAdaptiveFullVideoPlayback,
  useFullVideoPlaybackWatchdog,
} from './full-video-playback';
import useDelay from '@/utility/useDelay';
import { clsx } from 'clsx/lite';
import { releaseVideoElement } from './release-video-element';
import type { SubtitleTrack } from './subtitle-manifest';

export default function VideoZoomOverlay({
  usingCompatibility,
  onClose,
  returnFocusRef,
  videoUrl,
  playbackUrl,
  manifestUrl,
  mediaId,
  compatibilityUrl,
  posterUrl,
  onPlayManaged,
  startTime,
  captionsOn,
  subtitleTracks,
  activeCaptionIndex,
  onCloseWithTime,
}: {
  usingCompatibility: boolean
  onClose: () => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
  videoUrl: string
  playbackUrl: string
  manifestUrl?: string
  mediaId?: string
  compatibilityUrl?: string
  posterUrl?: string
  onPlayManaged?: (video: HTMLVideoElement) => void
  startTime?: number
  captionsOn?: boolean
  subtitleTracks?: SubtitleTrack[]
  activeCaptionIndex?: number
  onCloseWithTime?: (currentTime: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoMounted, setIsVideoMounted] = useState(false);
  const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
    if (!video) { releaseVideoElement(videoRef.current); }
    videoRef.current = video;
    setIsVideoMounted(Boolean(video));
  }, []);
  const progressiveUrlRef = useRef<{ source: string, url: string } | undefined>(undefined);
  const [retrySource, setRetrySource] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const showLoading = useDelay(350);
  const retriedUrls = useRef(new Set<string>());
  const activePlaybackUrl = retrySource ?? playbackUrl;
  const resumeAt = useRef(startTime);
  const activeManifestUrl = manifestUrl ? getFullVideoBridgeUrl(manifestUrl) : undefined;
  const progressiveUrl = progressiveUrlRef.current?.source === activePlaybackUrl
    ? progressiveUrlRef.current.url
    : undefined;
  const recoverPlayback = useCallback((video: HTMLVideoElement, code: number) => {
    if (video !== videoRef.current || code === 1 ||
      video.dataset.fullVideoHlsInitializing === 'true') { return; }
    const next = selectRetryVideoPlaybackUrl({
      sourceUrl: getFullVideoBridgeUrl(videoUrl),
      compatibilityUrl,
      wasUsingCompatibility: retrySource
        ? retrySource === compatibilityUrl
        : usingCompatibility,
      errorCode: code,
      retriedUrls: retriedUrls.current,
    });
    if (!next) {
      setHasPlaybackError(true);
      return;
    }
    retriedUrls.current.add(next);
    if (video.currentTime > 0) { resumeAt.current = video.currentTime; }
    setRetryCount(count => count + 1);
    if (next === activePlaybackUrl) { video.load(); }
    else { setRetrySource(next); }
  }, [activePlaybackUrl, compatibilityUrl, retrySource, usingCompatibility, videoUrl]);
  useFullVideoPlaybackWatchdog({
    active: isVideoMounted && !hasPlaybackError,
    attempt: retryCount,
    videoRef,
    onTimeout: recoverPlayback,
    onBufferingChange: setIsBuffering,
  });
  useAdaptiveFullVideoPlayback({
    active: isVideoMounted,
    videoRef,
    sourceUrl: activePlaybackUrl,
    compatibilityUrl,
    manifestUrl: activeManifestUrl,
    onTelemetry: telemetry => {
      window.dispatchEvent(new CustomEvent('media-full-video-telemetry', {
        detail: { mediaId, ...telemetry },
      }));
    },
    onProgressiveFallback: url => {
      progressiveUrlRef.current = { source: activePlaybackUrl, url };
    },
  });

  const applyCaptionMode = useCallback((video: HTMLVideoElement) => {
    const tracks = video.textTracks;
    if (!tracks) { return; }
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = captionsOn && i === (activeCaptionIndex ?? 0) ? 'showing' : 'hidden';
    }
  }, [activeCaptionIndex, captionsOn]);

  useEffect(() => {
    if (isVideoMounted && videoRef.current) { applyCaptionMode(videoRef.current); }
  }, [applyCaptionMode, isVideoMounted, subtitleTracks]);

  const close = () => {
    const video = videoRef.current;
    const time = video && video.readyState >= HTMLMediaElement.HAVE_METADATA
      ? video.currentTime
      : resumeAt.current;
    if (typeof time === 'number' && Number.isFinite(time)) { onCloseWithTime?.(time); }
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) { close(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content
          aria-modal="true"
          aria-describedby={undefined}
          className="fixed inset-x-4 top-1/2 z-[1001] mx-auto max-w-5xl -translate-y-1/2"
          onCloseAutoFocus={event => {
            event.preventDefault();
            returnFocusRef.current?.focus({ preventScroll: true });
          }}
        >
          <Dialog.Title className="sr-only">Expanded video player</Dialog.Title>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close expanded video"
              className={clsx(
                'absolute top-2 right-2 z-10 grid size-9 place-items-center',
                'rounded-full bg-black/75 text-white hover:bg-black',
                'focus-visible:outline-white',
              )}
            >
              <LuX size={20} />
            </button>
          </Dialog.Close>
          <video
            ref={setVideoRef}
            className="w-full h-full max-h-[80vh] object-contain rounded-md bg-black"
            src={progressiveUrl ?? activePlaybackUrl}
            poster={posterUrl}
            controls
            controlsList="nodownload noplaybackrate"
            autoPlay
            playsInline
            onContextMenu={event => event.preventDefault()}
            onError={event => {
              const video = event.currentTarget;
              if (video.error) { recoverPlayback(video, video.error.code); }
            }}
            onLoadStart={() => setIsReady(false)}
            onLoadedData={() => setIsReady(true)}
            onCanPlay={() => setIsReady(true)}
            onPlaying={() => {
              setIsReady(true);
              setHasPlaybackError(false);
            }}
            onLoadedMetadata={event => {
              const video = event.currentTarget;
              if (typeof resumeAt.current === 'number' && Number.isFinite(resumeAt.current)) {
                try { video.currentTime = Math.max(0, resumeAt.current); } catch {}
              }
              applyCaptionMode(video);
            }}
            onPlay={event => onPlayManaged?.(event.currentTarget)}
          >
            {subtitleTracks?.map((track, index) => <track
              key={`${track.src}-${index}`}
              kind="captions"
              src={track.src}
              srcLang={track.lang}
              label={track.label || track.lang}
              default={captionsOn && index === (activeCaptionIndex ?? 0)}
            />)}
          </video>
          {!hasPlaybackError && (isBuffering || (showLoading && !isReady)) && (
            <p role="status" className={clsx(
              'absolute bottom-14 inset-x-0 text-center text-white',
              'pointer-events-none',
            )}>
              <span className="rounded bg-black/75 px-3 py-1 text-sm">
                {isBuffering ? 'Buffering video…' : 'Loading video…'}
              </span>
            </p>
          )}
          {hasPlaybackError && <div className="flex flex-wrap items-center justify-center gap-3 p-3 text-white">
            <p role="status">Video could not play.</p>
            <button type="button" onClick={() => {
              const video = videoRef.current;
              if (!video) { return; }
              const previousSrc = video.getAttribute('src');
              retriedUrls.current.clear();
              progressiveUrlRef.current = undefined;
              flushSync(() => {
                setRetrySource(undefined);
                setRetryCount(count => count + 1);
                setHasPlaybackError(false);
              });
              if (video.getAttribute('src') === previousSrc) { video.load(); }
              void video.play().catch(() => undefined);
            }}>
              Retry video
            </button>
          </div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
