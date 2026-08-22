'use client';

import { useCallback, useEffect, useRef } from 'react';

// Preview videos are intentionally retried only a few times. A broken source
// must not create an infinite reload loop, but a transient mobile connection,
// decoder wake-up, or page-resume race should not require a full page refresh.
const RETRY_DELAYS_MS = [180, 500, 1200, 2500] as const;

type VideoPreviewRecoveryOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  active: boolean
  src?: string
  onFatalError?: () => void
}

export default function useVideoPreviewRecovery({
  videoRef,
  active,
  src,
  onFatalError,
}: VideoPreviewRecoveryOptions) {
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const sourceRef = useRef(src);
  const scheduleRetryRef = useRef<() => void>(() => undefined);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== undefined) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
    }
  }, []);

  const playWithRetry = useCallback((reload = false) => {
    const video = videoRef.current;
    if (!video || !active || document.hidden) { return; }
    if (reload) {
      try { video.load(); } catch { /* browser may be tearing down */ }
    }
    void video.play().catch(() => {
      // play() can reject while a mobile browser is resuming a suspended
      // document. The retry path below handles that without hiding the card.
      scheduleRetryRef.current();
    });
  }, [active, videoRef]);

  const scheduleRetry = useCallback(() => {
    if (!active || document.hidden || retryTimerRef.current !== undefined) {
      return;
    }
    const retryIndex = retryCountRef.current;
    if (retryIndex >= RETRY_DELAYS_MS.length) {
      onFatalError?.();
      return;
    }
    retryCountRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = undefined;
      const video = videoRef.current;
      if (!video || !active || document.hidden) { return; }
      // A media error leaves the element in a failed state until load() is
      // called. Calling it only on recovery attempts avoids needless reloads
      // during normal buffering.
      const shouldReload = Boolean(video.error) ||
        video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE;
      playWithRetry(shouldReload);
    }, RETRY_DELAYS_MS[retryIndex]);
  }, [active, onFatalError, playWithRetry, videoRef]);

  // Keep play's catch handler pointed at the current retry callback. This
  // small indirection avoids a circular callback dependency while preserving
  // stable event handlers for the video element.
  scheduleRetryRef.current = scheduleRetry;

  useEffect(() => {
    if (sourceRef.current === src) { return; }
    sourceRef.current = src;
    retryCountRef.current = 0;
    clearRetryTimer();
  }, [clearRetryTimer, src]);

  useEffect(() => {
    if (!active) {
      clearRetryTimer();
      retryCountRef.current = 0;
      videoRef.current?.pause();
      return;
    }
    const retryIfVisible = () => {
      const video = videoRef.current;
      if (!video || document.hidden) { return; }
      const shouldReload = Boolean(video.error) ||
        video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE;
      playWithRetry(shouldReload);
    };
    const onVisibilityChange = () => retryIfVisible();
    const scheduleInitialPlay = () => {
      window.setTimeout(retryIfVisible, 0);
    };
    scheduleInitialPlay();
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('resume', retryIfVisible);
    window.addEventListener('pageshow', retryIfVisible);
    window.addEventListener('focus', retryIfVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('resume', retryIfVisible);
      window.removeEventListener('pageshow', retryIfVisible);
      window.removeEventListener('focus', retryIfVisible);
    };
  }, [active, clearRetryTimer, playWithRetry, videoRef]);

  useEffect(() => () => clearRetryTimer(), [clearRetryTimer]);

  return {
    onCanPlay: () => playWithRetry(),
    onLoadedData: () => playWithRetry(),
    onPlaying: () => {
      retryCountRef.current = 0;
      clearRetryTimer();
    },
    onStalled: () => scheduleRetry(),
    onError: () => scheduleRetry(),
    retryNow: () => playWithRetry(true),
  };
}
