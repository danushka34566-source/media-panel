'use client';

import { useCallback, useEffect, useRef } from 'react';

// Preview videos are intentionally retried only a few times. A broken source
// must not create an infinite reload loop, but a transient mobile connection,
// decoder wake-up, or page-resume race should not require a full page refresh.
const RETRY_DELAYS_MS = [180, 500, 1200, 2500] as const;
const DECODE_WATCHDOG_MS = 6000;

type VideoPreviewRecoveryOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  active: boolean
  recoverWhileInactive?: boolean
  src?: string
  onFatalError?: () => void
}

export default function useVideoPreviewRecovery({
  videoRef,
  active,
  recoverWhileInactive = false,
  src,
  onFatalError,
}: VideoPreviewRecoveryOptions) {
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const decodeWatchdogRef = useRef<number | undefined>(undefined);
  const sourceRef = useRef(src);
  const activeRef = useRef(active);
  const recoverWhileInactiveRef = useRef(recoverWhileInactive);
  const onFatalErrorRef = useRef(onFatalError);
  const scheduleRetryRef = useRef<(forceReload?: boolean) => void>(
    () => undefined,
  );
  const armDecodeWatchdogRef = useRef<() => void>(() => undefined);
  activeRef.current = active;
  recoverWhileInactiveRef.current = recoverWhileInactive;
  onFatalErrorRef.current = onFatalError;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== undefined) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
    }
  }, []);

  const clearDecodeWatchdog = useCallback(() => {
    if (decodeWatchdogRef.current !== undefined) {
      window.clearTimeout(decodeWatchdogRef.current);
      decodeWatchdogRef.current = undefined;
    }
  }, []);

  const canRecover = useCallback(() =>
    activeRef.current || recoverWhileInactiveRef.current, []);

  const playWithRetry = useCallback((
    reload = false,
    forcePlay = false,
  ) => {
    const video = videoRef.current;
    if (!video || !canRecover() || document.hidden) { return; }
    if (reload) {
      try { video.load(); } catch { /* browser may be tearing down */ }
      armDecodeWatchdogRef.current();
    }
    if (!activeRef.current && !forcePlay) { return; }
    void video.play().catch(() => {
      // play() can reject while a mobile browser is resuming a suspended
      // document. The retry path below handles that without hiding the card.
      scheduleRetryRef.current();
    });
  }, [canRecover, videoRef]);

  const scheduleRetry = useCallback((forceReload = false) => {
    if (!canRecover() || document.hidden || retryTimerRef.current !== undefined) {
      return;
    }
    const retryIndex = retryCountRef.current;
    if (retryIndex >= RETRY_DELAYS_MS.length) {
      clearDecodeWatchdog();
      onFatalErrorRef.current?.();
      return;
    }
    retryCountRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = undefined;
      const video = videoRef.current;
      if (!video || !canRecover() || document.hidden) { return; }
      // A media error leaves the element in a failed state until load() is
      // called. Calling it only on recovery attempts avoids needless reloads
      // during normal buffering.
      const shouldReload = forceReload ||
        !activeRef.current ||
        Boolean(video.error) ||
        video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE;
      playWithRetry(shouldReload);
    }, RETRY_DELAYS_MS[retryIndex]);
  }, [canRecover, clearDecodeWatchdog, playWithRetry, videoRef]);

  // Keep play's catch handler pointed at the current retry callback. This
  // small indirection avoids a circular callback dependency while preserving
  // stable event handlers for the video element.
  scheduleRetryRef.current = scheduleRetry;

  const armDecodeWatchdog = useCallback(() => {
    clearDecodeWatchdog();
    if (!recoverWhileInactiveRef.current || document.hidden) { return; }
    decodeWatchdogRef.current = window.setTimeout(() => {
      decodeWatchdogRef.current = undefined;
      const video = videoRef.current;
      if (
        !video ||
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) { return; }
      scheduleRetryRef.current(true);
    }, DECODE_WATCHDOG_MS);
  }, [clearDecodeWatchdog, videoRef]);
  armDecodeWatchdogRef.current = armDecodeWatchdog;

  useEffect(() => {
    if (sourceRef.current === src) { return; }
    sourceRef.current = src;
    retryCountRef.current = 0;
    clearRetryTimer();
    armDecodeWatchdog();
  }, [armDecodeWatchdog, clearRetryTimer, src]);

  useEffect(() => {
    if (!recoverWhileInactive || !src) {
      clearDecodeWatchdog();
      return;
    }
    armDecodeWatchdog();
    return clearDecodeWatchdog;
  }, [
    armDecodeWatchdog,
    clearDecodeWatchdog,
    recoverWhileInactive,
    src,
  ]);

  useEffect(() => {
    if (!active) {
      videoRef.current?.pause();
      if (!recoverWhileInactive) {
        clearRetryTimer();
        clearDecodeWatchdog();
        retryCountRef.current = 0;
      }
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
    // The video is already mounted by the time this effect runs. Start the
    // request in this task so cached previews do not spend an extra turn in
    // the event loop before playback begins. The normal retry path still
    // handles browsers that reject play while resuming or waiting for data.
    retryIfVisible();
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
  }, [
    active,
    clearDecodeWatchdog,
    clearRetryTimer,
    playWithRetry,
    recoverWhileInactive,
    videoRef,
  ]);

  useEffect(() => () => {
    clearRetryTimer();
    clearDecodeWatchdog();
  }, [clearDecodeWatchdog, clearRetryTimer]);

  return {
    onLoadStart: () => armDecodeWatchdog(),
    onCanPlay: () => {
      clearDecodeWatchdog();
      playWithRetry();
    },
    onLoadedData: (forcePlay = false) => {
      clearDecodeWatchdog();
      playWithRetry(false, forcePlay);
    },
    onPlaying: () => {
      retryCountRef.current = 0;
      clearRetryTimer();
      clearDecodeWatchdog();
    },
    onStalled: () => scheduleRetry(false),
    onError: () => scheduleRetry(true),
    retryNow: () => playWithRetry(true),
  };
}
