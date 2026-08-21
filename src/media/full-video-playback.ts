'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

export type FullVideoSource = {
  sourceUrl: string
  compatibilityUrl?: string
  manifestUrl?: string
};

export type FullVideoBufferPolicy = {
  initialSeconds: number
  forwardSeconds: number
  maxForwardSeconds: number
  backwardSeconds: number
  maxBufferBytes: number
  monitorIntervalMs: number
};

export type FullVideoTelemetry = {
  type: 'buffer' | 'play' | 'playing' | 'waiting' | 'stalled' | 'progress' |
    'error' | 'source-fallback';
  currentTime: number
  duration: number
  buffered: Array<{ start: number, end: number }>
  forwardSeconds: number
  backwardSeconds: number
  readyState: number
  networkState: number
  source?: string
  error?: string
};

type ConnectionInfo = {
  saveData?: boolean
  effectiveType?: string
  downlink?: number
};

const DEFAULT_POLICY: FullVideoBufferPolicy = {
  initialSeconds: 6,
  forwardSeconds: 120,
  maxForwardSeconds: 300,
  backwardSeconds: 90,
  maxBufferBytes: 128 * 1024 * 1024,
  monitorIntervalMs: 1000,
};

/**
 * Derive the processor's flat HLS derivative. This is intentionally only
 * called after a user starts a full video; previews never use this helper.
 */
export const getFullVideoManifestUrl = (sourceUrl: string) => {
  try {
    const url = new URL(sourceUrl);
    const fileName = url.pathname.split('/').pop() || '';
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    url.pathname = url.pathname.replace(fileName, `${base}-hls.m3u8`);
    return url.toString();
  } catch {
    const [path, query] = sourceUrl.split('?');
    const parts = (path || sourceUrl).split('/');
    const fileName = parts.pop() || '';
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const result = [...parts, `${base}-hls.m3u8`].join('/');
    return query ? `${result}?${query}` : result;
  }
};

export const getFullVideoBufferPolicy = (
  connection?: ConnectionInfo,
  isMobile = false,
): FullVideoBufferPolicy => {
  const effectiveType = connection?.effectiveType?.toLowerCase();
  const constrained = connection?.saveData || effectiveType === 'slow-2g' ||
    effectiveType === '2g' || effectiveType === '3g' ||
    (typeof connection?.downlink === 'number' && connection.downlink < 2);
  if (connection?.saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
    return {
      initialSeconds: 4,
      forwardSeconds: 45,
      maxForwardSeconds: 90,
      backwardSeconds: 30,
      maxBufferBytes: 48 * 1024 * 1024,
      monitorIntervalMs: 1500,
    };
  }
  if (constrained) {
    return {
      initialSeconds: 5,
      forwardSeconds: 60,
      maxForwardSeconds: 150,
      backwardSeconds: 45,
      maxBufferBytes: 64 * 1024 * 1024,
      monitorIntervalMs: 1250,
    };
  }
  if (isMobile) {
    return {
      initialSeconds: 5,
      forwardSeconds: 90,
      maxForwardSeconds: 180,
      backwardSeconds: 60,
      maxBufferBytes: 64 * 1024 * 1024,
      monitorIntervalMs: 1250,
    };
  }
  return DEFAULT_POLICY;
};

export const getFullVideoBufferedRanges = (video: HTMLVideoElement) => {
  const ranges: Array<{ start: number, end: number }> = [];
  try {
    for (let i = 0; i < video.buffered.length; i++) {
      ranges.push({ start: video.buffered.start(i), end: video.buffered.end(i) });
    }
  } catch { /* media can change ranges while being detached */ }
  return ranges;
};

export const getFullVideoBufferTelemetry = (
  video: HTMLVideoElement,
  type: FullVideoTelemetry['type'] = 'buffer',
  source?: string,
  error?: string,
): FullVideoTelemetry => {
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const buffered = getFullVideoBufferedRanges(video);
  const containing = buffered.find(range => currentTime >= range.start && currentTime <= range.end);
  const backwardSeconds = containing ? Math.max(0, currentTime - containing.start) : 0;
  const forwardSeconds = containing ? Math.max(0, containing.end - currentTime) : 0;
  return {
    type,
    currentTime,
    duration,
    buffered,
    forwardSeconds,
    backwardSeconds,
    readyState: video.readyState,
    networkState: video.networkState,
    source,
    error,
  };
};

const getBrowserConnection = (): ConnectionInfo => {
  if (typeof navigator === 'undefined') { return {}; }
  const connection = (navigator as Navigator & {
    connection?: ConnectionInfo
  }).connection;
  return connection || {};
};

type AdaptivePlaybackOptions = FullVideoSource & {
  active: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  onTelemetry?: (telemetry: FullVideoTelemetry) => void
  onProgressiveFallback?: (url: string) => void
};

/**
 * Attach adaptive HLS to one explicitly activated full-video element. Native
 * HLS and progressive MP4 remain fallbacks, so older videos and browsers keep
 * working while HLS derivatives are generated.
 */
export const useAdaptiveFullVideoPlayback = ({
  active,
  videoRef,
  sourceUrl,
  compatibilityUrl,
  manifestUrl,
  onTelemetry,
  onProgressiveFallback,
}: AdaptivePlaybackOptions) => {
  const onTelemetryRef = useRef(onTelemetry);
  const onFallbackRef = useRef(onProgressiveFallback);
  onTelemetryRef.current = onTelemetry;
  onFallbackRef.current = onProgressiveFallback;
  const fallbackRef = useRef(false);

  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') { return; }
    const video = videoRef.current;
    if (!video) { return; }
    const policy = getFullVideoBufferPolicy(
      getBrowserConnection(),
      window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768,
    );
    video.preload = 'auto';
    fallbackRef.current = false;
    let disposed = false;
    let hls: {
      destroy: () => void
      startLoad?: (startPosition?: number) => void
      stopLoad?: () => void
    } | undefined;
    let currentSource = manifestUrl || getFullVideoManifestUrl(sourceUrl);
    const resumeTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const shouldResume = video.autoplay || !video.paused ||
      video.dataset.fullVideoPlayRequested === 'true';
    delete video.dataset.fullVideoPlayRequested;
    let hlsInitializing = true;
    // MediaLarge's React error handler uses this marker too. Set it before
    // removing the progressive source, so an MKV/native error cannot win the
    // race while hls.js is being imported.
    video.dataset.fullVideoHlsInitializing = 'true';
    const emit = (type: FullVideoTelemetry['type'], error?: string) => {
      onTelemetryRef.current?.(getFullVideoBufferTelemetry(video, type, currentSource, error));
    };
    const fallbackToProgressive = () => {
      if (disposed || fallbackRef.current) { return; }
      fallbackRef.current = true;
      try { hls?.destroy(); } catch { /* ignore */ }
      hls = undefined;
      // The compatibility derivative is the safest progressive fallback for
      // browsers that cannot consume HLS (notably MKV on mobile). The source
      // remains the final fallback when no derivative exists.
      const fallbackUrl = compatibilityUrl || sourceUrl;
      if (!fallbackUrl) { return; }
      const time = Number.isFinite(video.currentTime) ? video.currentTime : resumeTime;
      const wasPlaying = shouldResume || (!video.paused && !video.ended);
      hlsInitializing = false;
      delete video.dataset.fullVideoHlsInitializing;
      currentSource = fallbackUrl;
      video.src = fallbackUrl;
      video.load();
      try { video.currentTime = time; } catch { /* metadata may not be ready */ }
      onFallbackRef.current?.(fallbackUrl);
      emit('source-fallback');
      if (wasPlaying) { void video.play().catch(() => undefined); }
    };
    const onNativeError = () => {
      if (!fallbackRef.current && !hlsInitializing) { fallbackToProgressive(); }
    };
    const events: Array<[string, EventListener]> = [
      ['play', () => {
        video.preload = 'auto';
        hls?.startLoad?.();
        emit('play');
      }],
      ['pause', () => {
        hls?.stopLoad?.();
      }],
      ['playing', () => emit('playing')],
      ['waiting', () => emit('waiting')],
      ['stalled', () => emit('stalled')],
      ['progress', () => emit('progress')],
      ['error', onNativeError],
    ];
    events.forEach(([name, handler]) => video.addEventListener(name, handler));
    const timer = window.setInterval(() => emit('buffer'), policy.monitorIntervalMs);

    // Progressive playback is already mounted by React with the final source.
    // Leave that native load intact: removing and re-adding src here caused a
    // second authenticated redirect and made the first Play click wait.
    if (!manifestUrl) {
      hlsInitializing = false;
      delete video.dataset.fullVideoHlsInitializing;
      currentSource = sourceUrl;
      if (shouldResume) { void video.play().catch(() => undefined); }
      return () => {
        disposed = true;
        window.clearInterval(timer);
        events.forEach(([name, handler]) => video.removeEventListener(name, handler));
        video.preload = 'metadata';
      };
    }

    // Keep the initial progressive source out of the browser's native loader
    // only when an HLS manifest engine is actually being selected.
    try {
      video.removeAttribute('src');
      video.load();
    } catch { /* media element may already be detached */ }

    // hls.js is loaded only for an activated full video, keeping preview cards
    // out of the bundle's runtime work and out of the network prefetch path.
    void import('hls.js').then(({ default: Hls }) => {
      if (disposed || fallbackRef.current || !manifestUrl && !currentSource) { return; }
      if (!Hls.isSupported()) {
        // Safari/iOS can consume HLS natively. Other browsers will trigger the
        // element error handler and use progressive playback.
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          currentSource = manifestUrl || currentSource;
          hlsInitializing = false;
          delete video.dataset.fullVideoHlsInitializing;
          video.src = currentSource;
          video.load();
          const restoreNativeState = () => {
            video.removeEventListener('loadedmetadata', restoreNativeState);
            try { video.currentTime = resumeTime; } catch { /* wait for metadata */ }
            if (shouldResume) { void video.play().catch(() => undefined); }
          };
          video.addEventListener('loadedmetadata', restoreNativeState);
          if (video.readyState >= 1) { restoreNativeState(); }
          return;
        }
        fallbackToProgressive();
        return;
      }
      const instance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
        maxBufferLength: policy.forwardSeconds,
        maxMaxBufferLength: policy.maxForwardSeconds,
        backBufferLength: policy.backwardSeconds,
        maxBufferSize: policy.maxBufferBytes,
        capLevelToPlayerSize: true,
      });
      hls = instance;
      const eventsApi = (Hls as any).Events;
      instance.on(eventsApi.ERROR, (_event: unknown, data: { fatal?: boolean, details?: string }) => {
        if (data?.fatal) {
          emit('error', data.details || 'hls-fatal-error');
          fallbackToProgressive();
        }
      });
      instance.attachMedia(video);
      instance.on(eventsApi.MEDIA_ATTACHED, () => {
        if (!disposed && !fallbackRef.current) {
          currentSource = manifestUrl || getFullVideoManifestUrl(sourceUrl);
          (instance as any).loadSource(currentSource);
          hlsInitializing = false;
          delete video.dataset.fullVideoHlsInitializing;
        }
      });
      instance.on(eventsApi.MANIFEST_PARSED, () => {
        if (disposed || fallbackRef.current) { return; }
        try { video.currentTime = resumeTime; } catch { /* metadata may follow */ }
        if (shouldResume) { void video.play().catch(() => undefined); }
      });
    }).catch(() => fallbackToProgressive());

    return () => {
      disposed = true;
      window.clearInterval(timer);
      events.forEach(([name, handler]) => video.removeEventListener(name, handler));
      try { hls?.destroy(); } catch { /* ignore */ }
      hls = undefined;
      delete video.dataset.fullVideoHlsInitializing;
      video.preload = 'metadata';
    };
  }, [active, compatibilityUrl, manifestUrl, sourceUrl, videoRef]);
};
