'use client';

import {
  Media,
  altTextForMedia,
  doesMediaNeedBlurCompatibility,
  getDisplayTranscodeStatus,
  getMediaPosterUrl,
  getMediaAspectRatio,
  getMediaPreviewUrl,
  isVideoMedia,
  shouldShowCameraDataForMedia,
  shouldShowExifDataForMedia,
  shouldShowFilmDataForMedia,
  shouldShowLensDataForMedia,
  shouldShowRecipeDataForMedia,
  titleForMedia,
} from '.';
import AppGrid from '@/components/AppGrid';
import ImageLarge from '@/components/image/ImageLarge';
import { clsx } from 'clsx/lite';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pathForFocalLength, pathForMedia } from '@/app/path';
import MediaTags from '@/tag/MediaTags';
import ShareButton from '@/share/ShareButton';
import DownloadButton from '@/components/DownloadButton';
import MediaCamera from '../camera/MediaCamera';
import { cameraFromMedia } from '@/camera';
import MediaFilm from '@/film/MediaFilm';
import { sortTagsArray } from '@/tag';
import DivDebugBaselineGrid from '@/components/DivDebugBaselineGrid';
import MediaLink from './MediaLink';
import {
  SHOULD_PREFETCH_ALL_LINKS,
  ALLOW_PUBLIC_DOWNLOADS,
  SHOW_TAKEN_AT_TIME,
  MATTE_COLOR,
  MATTE_COLOR_DARK,
} from '@/app/config';
import AdminMediaMenu from '@/admin/AdminMediaMenu';
import { RevalidateMedia } from './InfiniteMediaScroll';
import type { MediaSetCategory } from '../category';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  TouchEvent,
  type ReactNode,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import useVisibility from '@/utility/useVisibility';
import MediaDate from './MediaDate';
import { useAppState } from '@/app/AppState';
import { LuExpand, LuPictureInPicture, LuCaptions, LuCaptionsOff, LuChevronDown, LuChevronUp } from 'react-icons/lu';
import LoaderButton from '@/components/primitives/LoaderButton';
import Tooltip from '@/components/Tooltip';
import ZoomControls, { ZoomControlsRef } from '@/components/image/ZoomControls';
import { AnimatePresence } from 'framer-motion';
import useRecipeOverlay from '../recipe/useRecipeOverlay';
import MediaRecipeOverlay from '@/recipe/MediaRecipeOverlay';
import MediaRecipe from '@/recipe/MediaRecipe';
import MediaLens from '@/lens/MediaLens';
import { lensFromMedia } from '@/lens';
import MaskedScroll from '@/components/MaskedScroll';
import { useAppText } from '@/i18n/state/client';
import { Album } from '@/album';
import { LuPlay } from 'react-icons/lu';
import { VideoPlaybackManager } from '@/utility/VideoPlaybackManager';
import MediaCategory from '@/category/MediaCategory';
import MediaStudio from '@/studio/MediaStudio';
import MediaPerformer from '@/performer/MediaPerformer';
import MediaContentType from '@/content-type/MediaContentType';
import useVideoPreviewLifecycle, {
  setFullVideoPlaybackActive,
  shouldSuspendVideoPreviews,
} from './video-preview-lifecycle';
import useVideoPreviewRecovery from './useVideoPreviewRecovery';
import useMediaPreload from './useMediaPreload';
import { FULL_IMAGE_LOAD_AHEAD_VIEWPORTS } from './loading-policy';
import {
  getSubtitleProxyManifestUrl,
  parseSubtitleManifest,
  SubtitleTrack,
} from './subtitle-manifest';
import {
  getCompatibilityPlaybackUrl,
  selectInitialVideoPlaybackUrl,
} from './compatibility-playback';
import {
  DETAIL_MAIN_VIDEO_PLAYBACK_EVENT,
  type DetailMainVideoPlayback,
} from './detail-video-playback';
import PersonalFavoriteButton from './PersonalFavoriteButton';
import {
  useAdaptiveFullVideoPlayback,
  type FullVideoTelemetry,
} from './full-video-playback';
import { getFullVideoBridgeUrl } from './full-video-bridge';

const SWIPE_NAVIGATION_DISTANCE = 50;
const SWIPE_NAVIGATION_VERTICAL_TOLERANCE = 70;
const SWIPE_NAVIGATION_LOCK_DISTANCE = 12;
const SWIPE_DISABLED_VIDEO_BOTTOM_HEIGHT = 96;
const SWIPE_DISABLED_VIDEO_BOTTOM_RATIO = 0.2;
const SWIPE_ANIMATION_LEFT = { type: 'left' as const, duration: 0.3 };
const SWIPE_ANIMATION_RIGHT = { type: 'right' as const, duration: 0.3 };
const VIDEO_EXTENSION_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  m2ts: 'video/mp2t',
  mts: 'video/mp2t',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  '3gp': 'video/3gpp',
  ogv: 'video/ogg',
};

const getVideoMimeType = (extension?: string | null) => {
  if (!extension) { return undefined; }
  const normalized = extension.toLocaleLowerCase();
  return VIDEO_EXTENSION_TO_MIME[normalized] ?? undefined;
};

const getExtensionFromUrl = (url?: string | null) => {
  if (!url) { return undefined; }
  try {
    const { pathname } = new URL(url);
    const lastSegment = pathname.split('/').pop();
    if (!lastSegment) { return undefined; }
    const [, ext = ''] = lastSegment.split('.').slice(-2);
    return ext || undefined;
  } catch {
    const path = url.split('?')[0] ?? '';
    const segment = path.split('/').pop() ?? '';
    const parts = segment.split('.');
    return parts.length > 1 ? parts.pop() : undefined;
  }
};

const formatVideoDuration = (seconds?: number) => {
  if (seconds === undefined || Number.isNaN(seconds)) {
    return undefined;
  }
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const segments = [
    hours > 0 ? hours.toString() : undefined,
    (hours > 0 || minutes > 0)
      ? minutes.toString().padStart(hours > 0 ? 2 : 1, '0')
      : undefined,
    secs.toString().padStart(hours > 0 || minutes > 0 ? 2 : 1, '0'),
  ].filter(Boolean) as string[];
  return segments.join(':');
};

const formatVideoLibraryLabel = (value?: string) =>
  value?.replaceAll('-', ' ');

export default function MediaLarge({
  photo,
  className,
  album,
  primaryTag,
  camera,
  lens,
  tag,
  category,
  studio,
  performer,
  contentType,
  film,
  recipe,
  focal,
  priority,
  initiallyLoadPreviewImage = false,
  prefetch = SHOULD_PREFETCH_ALL_LINKS,
  prefetchRelatedLinks = SHOULD_PREFETCH_ALL_LINKS,
  recent,
  year,
  revalidateMedia,
  showTitle = true,
  showTitleAsH1,
  showCamera = true,
  showLens = true,
  showFilm = true,
  showRecipe = true,
  showZoomControls: _showZoomControls = true,
  shouldZoomOnFKeydown = true,
  shouldShare = true,
  shouldShareRecents,
  shouldShareYear,
  shouldShareCamera,
  shouldShareLens,
  shouldShareAlbum,
  shouldShareTag,
  shouldShareFilm,
  shouldShareRecipe,
  shouldShareFocalLength,
  includeFavoriteInAdminMenu,
  onVisible,
  showAdminKeyCommands,
  swipePreviousPath,
  swipeNextPath,
  resolveOptimizedPlaybackUrl = true,
  preloadSubtitleManifest = false,
  broadcastDetailVideoPlayback = false,
}: {
  photo: Media
  className?: string
  album?: Album
  primaryTag?: string
  priority?: boolean
  initiallyLoadPreviewImage?: boolean
  prefetch?: boolean
  prefetchRelatedLinks?: boolean
  recent?: boolean
  year?: string
  revalidateMedia?: RevalidateMedia
  showTitle?: boolean
  showTitleAsH1?: boolean
  showCamera?: boolean
  showLens?: boolean
  showFilm?: boolean
  showRecipe?: boolean
  showZoomControls?: boolean
  shouldZoomOnFKeydown?: boolean
  shouldShare?: boolean
  shouldShareRecents?: boolean
  shouldShareYear?: boolean
  shouldShareCamera?: boolean
  shouldShareLens?: boolean
  shouldShareAlbum?: boolean
  shouldShareTag?: boolean
  shouldShareFilm?: boolean
  shouldShareRecipe?: boolean
  shouldShareFocalLength?: boolean
  includeFavoriteInAdminMenu?: boolean
  onVisible?: () => void
  showAdminKeyCommands?: boolean
  swipePreviousPath?: string
  swipeNextPath?: string
  resolveOptimizedPlaybackUrl?: boolean
  preloadSubtitleManifest?: boolean
  broadcastDetailVideoPlayback?: boolean
} & Pick<MediaSetCategory, 'camera' | 'lens' | 'tag' | 'category' |
  'studio' | 'performer' | 'contentType' | 'film' | 'recipe' | 'focal'>) {
  const router = useRouter();
  const isVideo = isVideoMedia(photo);
  const ref = useRef<HTMLDivElement>(null);
  const refZoomControls = useRef<ZoomControlsRef>(null);
  const refMediaRecipe = useRef<HTMLDivElement>(null);
  const refMediaFilm = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{
    x: number
    y: number
    isHorizontal: boolean
    ignoreSwipe: boolean
  } | undefined>(undefined);
  const [isVideoZoomOpen, setIsVideoZoomOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { videoPreviewMode = 'smart' } = useAppState();
  const [isPageResuming, setIsPageResuming] = useState(false);
  const [isFullVideoPlaying, setIsFullVideoPlaying] = useState(false);
  const [isPreparingFullVideo, setIsPreparingFullVideo] = useState(false);
  const [fullVideoDeliveryUrl, setFullVideoDeliveryUrl] = useState<string>();
  const [preparedFullVideoDownloads, setPreparedFullVideoDownloads] = useState<Record<string, {
    url: string
    expiresAt: number
  }>>({});
  const [isMainVideoActuallyPlaying, setIsMainVideoActuallyPlaying] =
    useState(false);
  const [hasStartedMainVideoPlayback, setHasStartedMainVideoPlayback] =
    useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [failedGeneratedPreviewSrc, setFailedGeneratedPreviewSrc] =
    useState<string>();
  const [readyPreviewSrc, setReadyPreviewSrc] = useState<string>();
  const [readyPreviewActivationId, setReadyPreviewActivationId] =
    useState<number>();
  const [posterFailedMediaId, setPosterFailedMediaId] = useState<string>();
  const [canUsePiP, setCanUsePiP] = useState(false);
  const [isPiPLocked, setIsPiPLocked] = useState(false);
  const [pipLockedSrc, setPipLockedSrc] = useState<string | undefined>(undefined);
  const [hasTextTracks, setHasTextTracks] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [activeCaptionIndex, setActiveCaptionIndex] = useState(0);
  const [shouldUseCompatibilityPlayback, setShouldUseCompatibilityPlayback] =
    useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[] | null>(null);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const langBtnRef = useRef<HTMLButtonElement>(null);
  const [langMenuRect, setLangMenuRect] = useState<{ top: number, left: number, width: number } | null>(null);
  const [langMenuIgnoreUntil, setLangMenuIgnoreUntil] = useState(0);
  const storageLangIndexKey = useMemo(() => `videoCaptionIndex:${photo.id}`,[photo.id]);
  const storageLangSrcKey = useMemo(() => `videoCaptionSrc:${photo.id}`,[photo.id]);
  const isProgrammaticCaptionChange = useRef(false);
  const updateLangMenuRect = () => {
    try {
      const r = langBtnRef.current?.getBoundingClientRect();
      if (r) { setLangMenuRect({ top: r.bottom - 2, left: r.right, width: r.width }); }
    } catch {}
  };

  useEffect(() => {
    if (!isLangMenuOpen) { return; }
    updateLangMenuRect();
    const onAny = () => updateLangMenuRect();
    const onClickOutside = (e: MouseEvent) => {
      const btn = langBtnRef.current;
      const target = e.target as HTMLElement | null;
      const isInsideMenu = !!target?.closest?.('[data-subtitle-lang-menu]');
      if (btn && (btn.contains(target as Node) || isInsideMenu)) { return; }
      setIsLangMenuOpen(false);
    };
    window.addEventListener('scroll', onAny, true);
    window.addEventListener('resize', onAny);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('scroll', onAny, true);
      window.removeEventListener('resize', onAny);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [isLangMenuOpen]);
  const [lastInlineWasPlaying, setLastInlineWasPlaying] = useState(false);
  const [zoomStartTime, setZoomStartTime] = useState<number | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsVideoZoomOpen(false);
    setIsFullVideoPlaying(false);
    setIsPreparingFullVideo(false);
    setFullVideoDeliveryUrl(undefined);
    setPreparedFullVideoDownloads({});
    setIsMainVideoActuallyPlaying(false);
    setHasStartedMainVideoPlayback(false);
    setFailedGeneratedPreviewSrc(undefined);
    setReadyPreviewSrc(undefined);
    setReadyPreviewActivationId(undefined);
    setShouldUseCompatibilityPlayback(false);
  }, [photo.id]);

  // Warm the adjacent route payloads while the current media is visible. The
  // browser can then apply the directional transition immediately instead of
  // waiting for the next server component response after a click or swipe.
  useEffect(() => {
    [swipePreviousPath, swipeNextPath].forEach(path => {
      if (path) { router.prefetch(path); }
    });
  }, [router, swipeNextPath, swipePreviousPath]);

  useEffect(() => {
    if (!shouldSuspendVideoPreviews({
      isMainVideoActuallyPlaying,
      isVideoFullscreen,
    })) { return; }
    setFullVideoPlaybackActive(true);
    return () => setFullVideoPlaybackActive(false);
  }, [isMainVideoActuallyPlaying, isVideoFullscreen]);

  useEffect(() => {
    if (!broadcastDetailVideoPlayback || !isVideo) { return; }
    const dispatch = (playing: boolean) => window.dispatchEvent(
      new CustomEvent<DetailMainVideoPlayback>(
        DETAIL_MAIN_VIDEO_PLAYBACK_EVENT,
        { detail: { mediaId: photo.id, playing } },
      ),
    );
    dispatch(isMainVideoActuallyPlaying);
    return () => {
      if (isMainVideoActuallyPlaying) { dispatch(false); }
    };
  }, [
    broadcastDetailVideoPlayback,
    isMainVideoActuallyPlaying,
    isVideo,
    photo.id,
  ]);

  // Inline full-video playback should not pause previews elsewhere on the
  // page. Only an actual browser/video fullscreen session owns playback.
  useEffect(() => {
    if (!isVideo || !isFullVideoPlaying) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsVideoFullscreen(false);
      return;
    }
    const video = videoRef.current;
    const updateFullscreen = () => {
      const documentFullscreen = document.fullscreenElement === video;
      const webkitFullscreen = (video as any)?.webkitPresentationMode ===
        'fullscreen';
      setIsVideoFullscreen(documentFullscreen || webkitFullscreen);
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    video?.addEventListener('webkitbeginfullscreen', updateFullscreen);
    video?.addEventListener('webkitendfullscreen', updateFullscreen);
    updateFullscreen();
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
      video?.removeEventListener('webkitbeginfullscreen', updateFullscreen);
      video?.removeEventListener('webkitendfullscreen', updateFullscreen);
    };
  }, [isFullVideoPlaying, isVideo]);

  useEffect(() => {
    if (!isVideo) { return; }
    try {
      const enabled = typeof document !== 'undefined' &&
        !!(document as any).pictureInPictureEnabled;
      const hasMethod = typeof HTMLVideoElement !== 'undefined' &&
        (
          'requestPictureInPicture' in (HTMLVideoElement.prototype as any) ||
          'webkitSupportsPresentationMode' in (HTMLVideoElement.prototype as any)
        );
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanUsePiP(Boolean(enabled) || Boolean(hasMethod));
    } catch {
      setCanUsePiP(false);
    }
  }, [isVideo]);

  

  const {
    areZoomControlsShown,
    areMediaMatted,
    shouldDebugRecipeOverlays,
    isUserSignedIn,
    setNextMediaAnimation,
  } = useAppState();

  const appText = useAppText();

  const mediaAspectRatio = getMediaAspectRatio(photo);
  const posterSrc = getMediaPosterUrl(photo);
  const previewSrc = getMediaPreviewUrl(photo);
  const compatibilityMp4Url = useMemo(
    () => getCompatibilityPlaybackUrl(previewSrc ?? photo.url),
    [photo.url, previewSrc],
  );
  const compatibilityPlaybackUrl = resolveOptimizedPlaybackUrl
    ? compatibilityMp4Url
    : undefined;
  const automaticPreviewSrc = previewSrc &&
    failedGeneratedPreviewSrc !== previewSrc
    ? previewSrc
    : undefined;
  const hasPosterFailed = posterFailedMediaId === photo.id;
  const displayTranscodeStatus = getDisplayTranscodeStatus(photo);
  const currentVideoUrl = isFullVideoPlaying
    ? (
      shouldUseCompatibilityPlayback && compatibilityPlaybackUrl
        ? compatibilityPlaybackUrl
        : photo.url
    )
    : (automaticPreviewSrc || '');
  // Full playback is deliberately progressive from the single original file.
  // The browser uses byte ranges to keep buffering ahead while it plays.
  const fullVideoManifestUrl = undefined;
  const preparedFullVideoDownload = preparedFullVideoDownloads[currentVideoUrl];
  const playbackClockRef = useRef(0);
  useEffect(() => {
    playbackClockRef.current = Date.now();
  }, [currentVideoUrl, isFullVideoPlaying, photo.id]);
  const preparedFullVideoUrl = preparedFullVideoDownload &&
    preparedFullVideoDownload.expiresAt > playbackClockRef.current + 10_000
    ? preparedFullVideoDownload.url
    : undefined;
  const fullVideoSourceUrl = isFullVideoPlaying
    ? fullVideoDeliveryUrl ?? preparedFullVideoUrl ??
      getFullVideoBridgeUrl(currentVideoUrl)
    : currentVideoUrl;
  const fullVideoCompatibilityUrl = compatibilityPlaybackUrl
    ? getFullVideoBridgeUrl(compatibilityPlaybackUrl)
    : undefined;

  const warmFullVideoDownload = useCallback((sourceUrl = photo.url) => {
    if (!isVideo || !sourceUrl) { return; }
    const url = getFullVideoBridgeUrl(sourceUrl);
    if (!url.startsWith('/api/media/full-video')) { return; }
    void fetch(url, {
      method: 'HEAD',
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(response => {
      const signedUrl = response.headers.get('x-media-signed-download');
      const expiresAt = Number(response.headers.get(
        'x-media-signed-download-expires-at',
      ));
      if (!signedUrl || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        return;
      }
      setPreparedFullVideoDownloads(current => {
        const previous = current[sourceUrl];
        if (previous?.url === signedUrl && previous.expiresAt === expiresAt) {
          return current;
        }
        return { ...current, [sourceUrl]: { url: signedUrl, expiresAt } };
      });
    }).catch(() => undefined);
  }, [isVideo, photo.url]);
  useAdaptiveFullVideoPlayback({
    // Zoom owns the active full-video session while open; keeping the inline
    // controller detached prevents two HLS pipelines from downloading at once.
    active: isVideo && isFullVideoPlaying && !isVideoZoomOpen,
    videoRef,
    sourceUrl: fullVideoSourceUrl,
    compatibilityUrl: fullVideoCompatibilityUrl,
    manifestUrl: fullVideoManifestUrl,
    onTelemetry: (telemetry: FullVideoTelemetry) => {
      // Keep diagnostics observable without coupling playback to UI state.
      try {
        window.dispatchEvent(new CustomEvent('media-full-video-telemetry', {
          detail: { mediaId: photo.id, ...telemetry },
        }));
      } catch { /* browser may be tearing down the page */ }
    },
    onProgressiveFallback: (url) => {
      if (fullVideoCompatibilityUrl && url === fullVideoCompatibilityUrl) {
        setShouldUseCompatibilityPlayback(true);
      }
    },
  });
  const {
    shouldMount: shouldMountPreview,
    isActive: isPreviewActive,
    isExiting: isPreviewExiting,
    activationId: previewActivationId,
  } = useVideoPreviewLifecycle({
    ref,
    enabled: Boolean(
      isVideo &&
      videoPreviewMode !== 'off' &&
      automaticPreviewSrc &&
      !isFullVideoPlaying,
    ),
    preloadEnabled: Boolean(
      isVideo &&
      videoPreviewMode !== 'off' &&
      automaticPreviewSrc &&
      !isFullVideoPlaying,
    ),
    preloadUrl: automaticPreviewSrc,
  });
  const shouldRenderPreview = shouldMountPreview || isPreviewExiting;
  const isAutomaticPreviewReady =
    readyPreviewSrc === automaticPreviewSrc &&
    readyPreviewActivationId === previewActivationId;

  // Mobile browsers can suspend the compositor and media decoder while the
  // device is locked. Re-assert the visible image/video state on resume so a
  // stale black video layer never hides the poster while the decoder wakes.
  useEffect(() => {
    if (!isVideo) { return; }
    let resetTimer: number | undefined;
    const recoverMedia = () => {
      if (document.hidden) { return; }
      setIsPageResuming(true);
      window.requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video) {
          try {
            if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
              video.load();
            }
            if (isMainVideoActuallyPlaying || (!isFullVideoPlaying && isPreviewActive)) {
              void video.play().catch(() => undefined);
            }
          } catch { /* browser may still be restoring the document */ }
        }
        if (resetTimer !== undefined) { window.clearTimeout(resetTimer); }
        resetTimer = window.setTimeout(() => setIsPageResuming(false), 900);
      });
    };
    const onVisibilityChange = () => {
      if (!document.hidden) { recoverMedia(); }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('resume', recoverMedia);
    window.addEventListener('pageshow', recoverMedia);
    window.addEventListener('focus', recoverMedia);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('resume', recoverMedia);
      window.removeEventListener('pageshow', recoverMedia);
      window.removeEventListener('focus', recoverMedia);
      if (resetTimer !== undefined) { window.clearTimeout(resetTimer); }
    };
  }, [isFullVideoPlaying, isMainVideoActuallyPlaying, isPreviewActive, isVideo]);

  const previewRecovery = useVideoPreviewRecovery({
    videoRef,
    active: Boolean(isVideo && !isFullVideoPlaying && isPreviewActive),
    src: automaticPreviewSrc,
    onFatalError: () => {
      if (automaticPreviewSrc) {
        setFailedGeneratedPreviewSrc(automaticPreviewSrc);
      }
    },
  });
  // Full-mode tiles are large, so prepare several upcoming images before the
  // user reaches them. Video previews use a separate strict viewport hook.
  const fullImagePreloadDistance = typeof window === 'undefined'
    ? 0
    : window.innerHeight * FULL_IMAGE_LOAD_AHEAD_VIEWPORTS;
  const {
    isInRange: isInPreloadRange,
  } = useMediaPreload({
    ref,
    preloadAheadPx: fullImagePreloadDistance,
  });
  // Keep the poster/image element mounted for every public full-page item.
  // Its native lazy policy controls bytes, while the preload hook continues
  // to warm adjacent full-video delivery. This removes the blank-frame race
  // when someone scrolls quickly past a row.
  const shouldLoadPreviewImage = true;
  const eagerMediaImage = Boolean(priority) || initiallyLoadPreviewImage ||
    isPageResuming || isInPreloadRange;
  // Do not prewarm every original video when a long full page mounts. That
  // creates one signed-download request per card (including cards hundreds of
  // rows below the viewport), exhausting browser/network memory and causing
  // the page to crash while scrolling. Cards near the viewport are warmed;
  // pointer-hover and explicit play still warm immediately on demand.
  useEffect(() => {
    if (!isVideo || !isInPreloadRange) { return; }
    warmFullVideoDownload();
  }, [isInPreloadRange, isVideo, warmFullVideoDownload]);
  const shouldLoadVideoPoster = shouldLoadPreviewImage &&
    Boolean(posterSrc && !hasPosterFailed);
  const showZoomControls = _showZoomControls && areZoomControlsShown && !isVideo;

  // Load persisted captions preference on mount
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined'
        ? window.localStorage.getItem('videoCaptionsOn')
        : null;
      if (saved !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCaptionsOn(saved === '1');
      }
    } catch { /* ignore */ }
  }, []);

  const fetchSubtitleManifest = async (signal?: AbortSignal) => {
    if (!isVideo) { setSubtitleTracks(null); return; }
    // Add a cache-busting param to avoid stale JSON from proxies
    const manifestUrl =
      `${getSubtitleProxyManifestUrl(photo.id)}?t=${Date.now()}`;
    try {
      const res = await fetch(manifestUrl, { cache: 'no-store', signal });
      if (!res.ok) { setSubtitleTracks(null); return; }
      const tracks = parseSubtitleManifest(await res.json().catch(() => null));
      setSubtitleTracks(tracks.length > 0 ? tracks : null);
      // Adjust active index if needed
      setActiveCaptionIndex((idx) => {
        const max = (tracks.length || 1) - 1;
        return Math.min(idx, Math.max(0, max));
      });
    } catch {
      setSubtitleTracks(null);
    }
  };

  // Detail pages discover captions before playback so track elements are
  // present on the first full-player mount. List cards still wait for explicit
  // playback to avoid fetching a manifest for every item.
  useEffect(() => {
    if (!isVideo || (!isFullVideoPlaying && !preloadSubtitleManifest)) {
      return;
    }
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSubtitleManifest(controller.signal);
    return () => controller.abort();
  }, [
    photo.id,
    isVideo,
    isFullVideoPlaying,
    photo.url,
    preloadSubtitleManifest,
  ]);

  // Refresh manifest each time the language menu opens
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLangMenuOpen) { fetchSubtitleManifest(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLangMenuOpen]);
  // Detect in-band text tracks and keep them hidden by default
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isVideo) { setHasTextTracks(false); return; }
    const v = videoRef.current;
    if (!v) { return; }
    const refresh = () => {
      try {
        const tracks: TextTrackList = v.textTracks as any;
        const count = tracks?.length ?? 0;
        setHasTextTracks(count > 0 || (subtitleTracks?.length ?? 0) > 0);
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const t = tracks[i];
            if (t) { t.mode = captionsOn && i === activeCaptionIndex ? 'showing' : 'hidden'; }
          }
        }
      } catch {
        setHasTextTracks(false);
      }
    };
    const onLoaded = () => refresh();
    v.addEventListener('loadedmetadata', onLoaded);
    // Some browsers fire addtrack when parsing in-band tracks
    try {
      (v.textTracks as any)?.addEventListener?.('addtrack', refresh);
      (v.textTracks as any)?.addEventListener?.('removetrack', refresh);
    } catch {}
    // Initial attempt
    refresh();
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      try {
        (v.textTracks as any)?.removeEventListener?.('addtrack', refresh);
        (v.textTracks as any)?.removeEventListener?.('removetrack', refresh);
      } catch {}
    };
  }, [isVideo, captionsOn, activeCaptionIndex, currentVideoUrl, subtitleTracks]);

  // Sync UI state if user changes captions via native player controls
  useEffect(() => {
    if (!isVideo) { return; }
    const v = videoRef.current;
    if (!v) { return; }
    const tracks: any = v.textTracks as any;
    const handler = () => {
      if (isProgrammaticCaptionChange.current) { return; }
      try {
        const count = tracks?.length ?? 0;
        if (count === 0) { return; }
        let showing = -1;
        for (let i = 0; i < count; i++) {
          if (tracks[i] && tracks[i].mode === 'showing') { showing = i; break; }
        }
        setCaptionsOn(showing >= 0);
        if (showing >= 0) { setActiveCaptionIndex(showing); }
        try { window.localStorage.setItem('videoCaptionsOn', showing >= 0 ? '1' : '0'); } catch {}
      } catch { /* ignore */ }
    };
    try { tracks?.addEventListener?.('change', handler); } catch {}
    return () => {
      try { tracks?.removeEventListener?.('change', handler); } catch {}
    };
  }, [isVideo, isFullVideoPlaying, subtitleTracks]);

  const applyCaptionState = (show: boolean, index: number) => {
    const v = videoRef.current;
    const tracks: any = v?.textTracks as any;
    const count = tracks?.length ?? 0;
    const boundedIndex = Math.max(0, index);
    if (!v || count === 0) {
      setCaptionsOn(show);
      setActiveCaptionIndex(boundedIndex);
      try { window.localStorage.setItem('videoCaptionsOn', show ? '1' : '0'); } catch {}
      try {
        if (show) {
          window.localStorage.setItem(storageLangIndexKey, String(boundedIndex));
          const src = (subtitleTracks || [])[boundedIndex]?.src;
          if (src) { window.localStorage.setItem(storageLangSrcKey, src); }
        }
      } catch { /* ignore */ }
      return;
    }
    isProgrammaticCaptionChange.current = true;
    for (let i = 0; i < count; i++) {
      const t = tracks[i];
      if (!t) { continue; }
      // eslint-disable-next-line react-hooks/immutability
      t.mode = (show && i === boundedIndex) ? 'showing' : 'hidden';
    }
    try {
      // Also update <track> default attribute for better browser behavior
      const trackEls = (v.querySelectorAll('track') || []) as any;
      for (let i = 0; i < (trackEls.length || 0); i++) {
        const el = trackEls[i] as HTMLTrackElement;
        if (!el) { continue; }
        if (show && i === boundedIndex) { el.setAttribute('default', ''); }
        else { el.removeAttribute('default'); }
      }
    } catch { /* ignore */ }
    setCaptionsOn(show);
    setActiveCaptionIndex(boundedIndex);
    try { window.localStorage.setItem('videoCaptionsOn', show ? '1' : '0'); } catch {}
    try {
      if (show) {
        window.localStorage.setItem(storageLangIndexKey, String(boundedIndex));
        const src = (subtitleTracks || [])[boundedIndex]?.src;
        if (src) { window.localStorage.setItem(storageLangSrcKey, src); }
      }
    } catch { /* ignore */ }
    setTimeout(() => { isProgrammaticCaptionChange.current = false; }, 0);
    // Also sync PiP document window tracks if used
    try { VideoPlaybackManager.syncTextTracksFrom(v, show, boundedIndex); } catch {}
  };

  const toggleCaptions = () => applyCaptionState(!captionsOn, activeCaptionIndex);

  const changeCaptionLanguage = (index: number) => applyCaptionState(true, index);

  // Keep UI in sync if the user changes captions via native controls
  useEffect(() => {
    if (!isVideo) { return; }
    const v = videoRef.current;
    if (!v || !v.textTracks) { return; }
    const tracks: any = v.textTracks as any;
    const syncFromTracks = () => {
      if (isProgrammaticCaptionChange.current) { return; }
      try {
        const count = tracks?.length ?? 0;
        if (count === 0) { return; }
        let showing = -1;
        for (let i = 0; i < count; i++) {
          if (tracks[i] && tracks[i].mode === 'showing') { showing = i; break; }
        }
        setCaptionsOn(showing >= 0);
        if (showing >= 0) { setActiveCaptionIndex(showing); }
      } catch { /* ignore */ }
    };
    try { tracks.addEventListener('change', syncFromTracks); } catch {}
    return () => {
      try { tracks.removeEventListener('change', syncFromTracks); } catch {}
    };
  }, [isVideo, isFullVideoPlaying, subtitleTracks]);

  // Restore last selected language for this video when tracks are available
  useEffect(() => {
    if ((subtitleTracks?.length ?? 0) === 0) { return; }
    try {
      const savedSrc = window.localStorage.getItem(storageLangSrcKey);
      let idx = -1;
      if (savedSrc) {
        idx = (subtitleTracks || []).findIndex(t => t?.src === savedSrc);
      }
      if (idx < 0) {
        const savedIdxRaw = window.localStorage.getItem(storageLangIndexKey);
        const len = subtitleTracks?.length ?? 0;
        const parsed = savedIdxRaw !== null ? Number(savedIdxRaw) : NaN;
        if (!Number.isNaN(parsed)) { idx = Math.min(Math.max(0, parsed), Math.max(0, len - 1)); }
      }
      if (idx >= 0 && idx !== activeCaptionIndex) {
        // Do not force captions on; keep current on/off state
        applyCaptionState(captionsOn, idx);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id, subtitleTracks]);
  useEffect(() => {
    if (!isVideo) { return; }
    const v = videoRef.current;
    if (!v) { return; }
    const handlePlay = () => {
      // Only manage when full video is playing, not the preview
      if (isFullVideoPlaying) {
        VideoPlaybackManager.requestPlay(v, { preferPiP: VideoPlaybackManager.isPiPActive() });
      }
    };
    v.addEventListener('play', handlePlay);
    return () => {
      v.removeEventListener('play', handlePlay);
    };
  }, [isVideo, isFullVideoPlaying]);
  useEffect(() => {
    if (!isVideo) { return; }
    const v = videoRef.current as any;
    if (!v) { return; }
    const handleEnter = () => {
      setIsPiPLocked(true);
      try {
        setPipLockedSrc(v.currentSrc || v.src || currentVideoUrl);
      } catch {
        setPipLockedSrc(currentVideoUrl);
      }
      // Ensure selected track is default + showing for PiP rendering in Chrome
      try {
        const tracks: any = v.textTracks as any;
        const count = tracks?.length ?? 0;
        isProgrammaticCaptionChange.current = true;
        for (let i = 0; i < count; i++) {
          const t = tracks[i];
          if (!t) { continue; }
          t.mode = (captionsOn && i === activeCaptionIndex) ? 'showing' : 'hidden';
        }
        const trackEls = v.querySelectorAll('track');
        for (let i = 0; i < trackEls.length; i++) {
          const el = trackEls[i] as HTMLTrackElement;
          if (captionsOn && i === activeCaptionIndex) { el.setAttribute('default', ''); }
          else { el.removeAttribute('default'); }
        }
        setTimeout(() => { isProgrammaticCaptionChange.current = false; }, 0);
      } catch { /* ignore */ }
    };
    const handleLeave = () => {
      setIsPiPLocked(false);
      setPipLockedSrc(undefined);
      // Keep current captions state when leaving PiP
    };
    v.addEventListener('enterpictureinpicture', handleEnter);
    v.addEventListener('leavepictureinpicture', handleLeave);
    const handleWebkit = () => {
      try {
        const mode = v.webkitPresentationMode;
        if (mode === 'picture-in-picture') { handleEnter(); }
        else { handleLeave(); }
      } catch { /* ignore */ }
    };
    if ('webkitpresentationmodechanged' in v) {
      v.addEventListener('webkitpresentationmodechanged', handleWebkit);
    }
    return () => {
      v.removeEventListener('enterpictureinpicture', handleEnter);
      v.removeEventListener('leavepictureinpicture', handleLeave);
      if ('webkitpresentationmodechanged' in v) {
        v.removeEventListener('webkitpresentationmodechanged', handleWebkit);
      }
    };
  }, [isVideo, currentVideoUrl]);
  const selectZoomImageElement = useCallback(
    (container: HTMLElement | null) => Array
      .from(container?.getElementsByTagName('img') ?? [])
      // Ignore fallback blur images
      .filter((img) => !img.src.startsWith('data:image'))[0]
    , []);

  const refRecipe = useRef<HTMLDivElement>(null);
  const refTriggers = useMemo(() => [
    refMediaRecipe,
    refMediaFilm,
  ], []);
  const {
    isShowingRecipeOverlay,
    toggleRecipeOverlay,
    hideRecipeOverlay,
  } = useRecipeOverlay({
    ref: refRecipe,
    refTriggers,
  });

  const tags = sortTagsArray(photo.tags, primaryTag);

  const mediaCamera = cameraFromMedia(photo);
  const mediaLens = lensFromMedia(photo);
  const { recipeTitle } = photo;

  const showExifContent = shouldShowExifDataForMedia(photo);

  const showCameraContent = showCamera && shouldShowCameraDataForMedia(photo);
  const showLensContent = showLens && shouldShowLensDataForMedia(photo);
  const showTagsContent = tags.length > 0;
  const showRecipeContent = showRecipe && shouldShowRecipeDataForMedia(photo);
  const showFilmContent = showFilm && shouldShowFilmDataForMedia(photo);
  const showVideoLibraryMeta = isVideo && (
    photo.categories.length > 0 ||
    photo.contentType.length > 0 ||
    Boolean(photo.studio) ||
    photo.performers.length > 0
  );
  const showVideoMeta =
    isVideo &&
    (
      photo.durationSeconds ||
      (photo.mediaWidth && photo.mediaHeight) ||
      photo.frameRate ||
      displayTranscodeStatus
    );
  const videoDurationText = formatVideoDuration(photo.durationSeconds);
  const videoFrameRateText = photo.frameRate
    ? new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(photo.frameRate)
    : undefined;
  const videoResolutionText = photo.mediaWidth && photo.mediaHeight
    ? `${photo.mediaWidth} × ${photo.mediaHeight}`
    : undefined;

  const videoLibraryCategories = photo.categories
    .map(category => ({
      value: category,
      label: formatVideoLibraryLabel(category) ?? category,
    }))
    .filter(({ label }) => Boolean(label));
  const videoLibraryContentTypes = photo.contentType
    .map(contentType => ({
      value: contentType,
      label: formatVideoLibraryLabel(contentType) ?? contentType,
    }))
    .filter(({ label }) => Boolean(label));
  const videoLibraryStudio = photo.studio?.trim();
  const videoLibraryPerformers = photo.performers
    .map(performer => performer.trim())
    .filter(Boolean);

  useVisibility({ ref, onVisible });

  const hasTitle =
    showTitle &&
    Boolean(photo.title);

  const hasTitleContent =
    hasTitle ||
    Boolean(photo.caption) ||
    showVideoLibraryMeta;

  const hasMetaContent =
    showCameraContent ||
    showLensContent ||
    showTagsContent ||
    showRecipeContent ||
    showFilmContent ||
    showExifContent ||
    showVideoLibraryMeta;

  const hasNonDateContent =
    hasTitleContent ||
    hasMetaContent;

  const renderMediaLink =
    <MediaLink
      photo={photo}
      className="font-bold uppercase grow break-all whitespace-normal"
      prefetch={prefetch}
    />;

  // Restrict width for landscape photos
  // (portrait photos are always height restricted)
  const matteContentWidthForAspectRatio =
    mediaAspectRatio > 3 / 2 + 0.1
      ? 'w-[90%]'
      : mediaAspectRatio >= 1
        ? 'w-[80%]'
        : undefined;

  const onSwipeTouchStart = useCallback((event: TouchEvent) => {
    if (event.touches.length !== 1) {
      swipeStartRef.current = undefined;
      return;
    }
    const touch = event.touches[0];
    const target = event.target as HTMLElement | null;
    const isPlayOverlayTarget = Boolean(
      target?.closest('[data-media-play-overlay="true"]'),
    );
    const isInteractiveTarget = Boolean(
      target?.closest('button, a, input, textarea, select, [role="button"]'),
    ) && !isPlayOverlayTarget;
    const videoElement = target?.closest('video');
    let ignoreSwipe = isInteractiveTarget;

    if (!ignoreSwipe && videoElement) {
      const rect = videoElement.getBoundingClientRect();
      const disabledHeight = Math.max(
        SWIPE_DISABLED_VIDEO_BOTTOM_HEIGHT,
        rect.height * SWIPE_DISABLED_VIDEO_BOTTOM_RATIO,
      );
      const distanceFromBottom = rect.bottom - touch.clientY;
      ignoreSwipe = distanceFromBottom <= disabledHeight;
    }

    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      isHorizontal: false,
      ignoreSwipe,
    };
  }, []);

  const onSwipeTouchMove = useCallback((event: TouchEvent) => {
    const start = swipeStartRef.current;
    if (!start || start.ignoreSwipe || event.touches.length !== 1) { return; }

    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (
      !start.isHorizontal &&
      absX >= SWIPE_NAVIGATION_LOCK_DISTANCE &&
      absX > absY * 1.2
    ) {
      start.isHorizontal = true;
    }

    if (start.isHorizontal) {
      event.preventDefault();
    }
  }, []);

  const onSwipeTouchEnd = useCallback((event: TouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = undefined;
    if (!start || start.ignoreSwipe || event.changedTouches.length !== 1) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (
      Math.abs(deltaX) < SWIPE_NAVIGATION_DISTANCE ||
      Math.abs(deltaY) > SWIPE_NAVIGATION_VERTICAL_TOLERANCE ||
      Math.abs(deltaY) > Math.abs(deltaX) * 0.8
    ) {
      return;
    }

    if (deltaX < 0 && swipeNextPath) {
      setNextMediaAnimation?.(SWIPE_ANIMATION_LEFT);
      router.push(swipeNextPath, { scroll: false });
    } else if (deltaX > 0 && swipePreviousPath) {
      setNextMediaAnimation?.(SWIPE_ANIMATION_RIGHT);
      router.push(swipePreviousPath, { scroll: false });
    }
  }, [
    router,
    setNextMediaAnimation,
    swipeNextPath,
    swipePreviousPath,
  ]);

  const renderLargeMedia =
    <div
      ref={ref}
      className={clsx(
        'relative',
        'touch-pan-y',
        areMediaMatted && 'flex items-center justify-center',
        // Always specify height to ensure fallback doesn't collapse
        areMediaMatted && 'h-[90%]',
        areMediaMatted && matteContentWidthForAspectRatio,
      )}
      onTouchStart={onSwipeTouchStart}
      onTouchMove={onSwipeTouchMove}
      onTouchEnd={onSwipeTouchEnd}
      onTouchCancel={() => {
        swipeStartRef.current = undefined;
      }}
    >
      {showZoomControls
        ? <ZoomControls
          ref={refZoomControls}
          selectImageElement={selectZoomImageElement}
          {...{ isEnabled: showZoomControls, shouldZoomOnFKeydown }}
        >
          {shouldLoadPreviewImage
            ? <ImageLarge
              className={clsx(areMediaMatted && 'h-full')}
              classNameImage={clsx(areMediaMatted &&
                'object-contain w-full h-full')}
              alt={altTextForMedia(photo)}
              src={photo.url}
              aspectRatio={photo.aspectRatio}
              blurDataURL={photo.blurData}
              blurCompatibilityMode={doesMediaNeedBlurCompatibility(photo)}
              priority={priority}
              loading={eagerMediaImage ? 'eager' : 'lazy'}
                        fetchPriority={priority ? 'high' : 'auto'}
              showLoadingIndicator
            />
            : <div
              className="w-full bg-black/5"
              style={{ aspectRatio: mediaAspectRatio }}
            />}
        </ZoomControls>
        : <div className={clsx(
          'relative w-full',
          !isVideo && 'h-full',
          areMediaMatted && 'flex items-center justify-center',
        )}
        style={isVideo ? { aspectRatio: mediaAspectRatio } : undefined}>
          {isVideo
            ? <>
                {!isFullVideoPlaying && (
                  posterSrc && shouldLoadVideoPoster && !hasPosterFailed
                    ? <div
                      key={`poster-${photo.id}`}
                      className="absolute inset-0 z-0"
                    >
                      <ImageLarge
                        className="h-full w-full"
                        classNameFallback="bg-black"
                        classNameImage={clsx(
                          'h-full w-full',
                          areMediaMatted ? 'object-contain' : 'object-cover',
                          'rounded-md bg-black',
                        )}
                        src={posterSrc}
                        aspectRatio={mediaAspectRatio}
                        alt={altTextForMedia(photo)}
                        priority={priority}
                        loading={eagerMediaImage ? 'eager' : 'lazy'}
                        fetchPriority={priority ? 'high' : 'auto'}
                        onError={() => setPosterFailedMediaId(photo.id)}
                        showLoadingIndicator
                      />
                    </div>
                    : <div
                      key={`poster-fallback-${photo.id}`}
                      className="absolute inset-0 z-0 max-h-full w-full rounded-md bg-black"
                    />
                )}
                {(isFullVideoPlaying || shouldRenderPreview) &&
                  <video
                    ref={videoRef}
                    className={clsx(
                      'relative z-10 max-h-full w-full',
                      areMediaMatted ? 'object-contain' : 'object-cover',
                      'rounded-md bg-black',
                      !isFullVideoPlaying &&
                        'transition-opacity duration-150',
                      !isFullVideoPlaying &&
                        !isAutomaticPreviewReady &&
                        'opacity-0',
                    )}
                    key={[
                      'video',
                      photo.id,
                      isFullVideoPlaying ? 'full' : 'preview',
                    ].join('-')}
                    src={(() => {
                      const actualUrl = isPiPLocked
                        ? (pipLockedSrc ?? currentVideoUrl)
                        : currentVideoUrl;
                      return isFullVideoPlaying
                        ? fullVideoSourceUrl
                        : actualUrl;
                    })()}
                    style={{ aspectRatio: mediaAspectRatio }}
                    poster={isFullVideoPlaying && shouldLoadVideoPoster
                      ? posterSrc
                      : undefined}
                    playsInline
                    autoPlay={!isFullVideoPlaying && isPreviewActive}
                    muted={!isFullVideoPlaying}
                    loop={!isFullVideoPlaying}
                    controls={isFullVideoPlaying}
                    controlsList="nodownload noplaybackrate"
                    onContextMenu={(e) => e.preventDefault()}
                    onPlay={() => {
                      if (isFullVideoPlaying) {
                        setHasStartedMainVideoPlayback(true);
                        setIsMainVideoActuallyPlaying(true);
                      }
                    }}
                    onPause={() => {
                      if (isFullVideoPlaying) {
                        setIsMainVideoActuallyPlaying(false);
                      }
                    }}
                    onEnded={() => {
                      setIsMainVideoActuallyPlaying(false);
                    }}
                    preload="auto"
                    onLoadStart={() => {
                      if (!isFullVideoPlaying && isPreviewActive) {
                        setReadyPreviewSrc(undefined);
                        setReadyPreviewActivationId(undefined);
                      }
                    }}
                    onLoadedData={() => {
                      if (!isFullVideoPlaying && automaticPreviewSrc) {
                        setReadyPreviewSrc(automaticPreviewSrc);
                        setReadyPreviewActivationId(previewActivationId);
                        previewRecovery.onLoadedData();
                      }
                    }}
                    onCanPlay={() => {
                      if (!isFullVideoPlaying && isPreviewActive) {
                        previewRecovery.onCanPlay();
                      }
                    }}
                    onPlaying={() => {
                      if (!isFullVideoPlaying && automaticPreviewSrc) {
                        setReadyPreviewSrc(automaticPreviewSrc);
                        setReadyPreviewActivationId(previewActivationId);
                        previewRecovery.onPlaying();
                      }
                    }}
                    onWaiting={() => {
                      if (!isFullVideoPlaying) {
                        setReadyPreviewSrc(undefined);
                        setReadyPreviewActivationId(undefined);
                      }
                    }}
                    onStalled={() => {
                      if (!isFullVideoPlaying) {
                        setReadyPreviewSrc(undefined);
                        setReadyPreviewActivationId(undefined);
                        previewRecovery.onStalled();
                      }
                    }}
                    onError={event => {
                      if (isFullVideoPlaying) {
                        if (event.currentTarget.dataset.fullVideoHlsInitializing === 'true') {
                          return;
                        }
                        setShouldUseCompatibilityPlayback(true);
                        const fallbackUrl = fullVideoCompatibilityUrl;
                        if (fallbackUrl) {
                          const video = event.currentTarget;
                          if (video.src !== fallbackUrl) {
                            video.src = fallbackUrl;
                            video.load();
                            void video.play().catch(() => undefined);
                          }
                        }
                      } else {
                        setReadyPreviewSrc(undefined);
                        setReadyPreviewActivationId(undefined);
                        previewRecovery.onError();
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget as HTMLVideoElement;
                      // Apply caption mode when tracks are present
                      try {
                        const tracks = v.textTracks;
                        if (tracks && tracks.length > 0) {
                          for (let i = 0; i < tracks.length; i++) {
                            // Previews never need text tracks.
                            if (!isFullVideoPlaying) {
                              (tracks[i] as any).mode = 'disabled';
                              continue;
                            }
                            (tracks[i] as any).mode =
                              captionsOn && i === activeCaptionIndex
                                ? 'showing'
                                : 'hidden';
                          }
                        }
                      } catch {}
                    }}
                  >
                    {isFullVideoPlaying && subtitleTracks && (() => {
                    // Attach only manifest-backed tracks. A fabricated fallback
                    // makes native players expose a captions menu whose file
                    // does not exist for multi-track media.
                    const tracks = subtitleTracks;
                    return <>
                      {tracks.map((t: any, i: number) => (
                        <track
                          key={`${t.src}-${i}`}
                          kind="captions"
                          src={t.src}
                          srcLang={t.lang}
                          label={t.label || t.lang}
                          {...(captionsOn && i === activeCaptionIndex
                            ? { default: true }
                            : {})}
                        />
                      ))}
                    </>;
                  })()}
                  Sorry, your browser does not support embedded videos.
                  </video>}
                </>
            : shouldLoadPreviewImage
              ? <ImageLarge
              className={clsx(areMediaMatted && 'h-full')}
              classNameImage={clsx(areMediaMatted &&
                'object-contain w-full h-full')}
              alt={altTextForMedia(photo)}
              src={photo.url}
              aspectRatio={photo.aspectRatio}
              blurDataURL={photo.blurData}
              blurCompatibilityMode={doesMediaNeedBlurCompatibility(photo)}
              priority={priority}
              loading={eagerMediaImage ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              showLoadingIndicator
            />
              : <div
                className="w-full bg-black/5"
                style={{ aspectRatio: mediaAspectRatio }}
              />}
          {/* Removed top-left video label */}
          {isVideo && isPiPLocked && !isFullVideoPlaying && currentVideoUrl && (
            <video
              className={clsx(
                'absolute inset-0 w-full h-full',
                areMediaMatted ? 'object-contain' : 'object-cover',
                'rounded-md bg-black pointer-events-none',
              )}
              src={currentVideoUrl}
              playsInline
              autoPlay
              muted
              loop
              controlsList="nodownload noplaybackrate"
              onContextMenu={(e) => e.preventDefault()}
              preload="metadata"
            />
          )}
          {isVideo && !isFullVideoPlaying && (
            <button
              type="button"
              data-media-play-overlay="true"
              aria-label="Play video"
              disabled={isPreparingFullVideo}
              className={clsx(
                'absolute inset-0 grid place-items-center',
                'z-20',
                'bg-black/0 hover:bg-black/10 focus:bg-black/10 transition-colors',
                'cursor-pointer',
              )}
              onPointerEnter={() => {
                warmFullVideoDownload();
                if (compatibilityPlaybackUrl) {
                  warmFullVideoDownload(compatibilityPlaybackUrl);
                }
              }}
              onPointerDown={() => {
                warmFullVideoDownload();
                if (compatibilityPlaybackUrl) {
                  warmFullVideoDownload(compatibilityPlaybackUrl);
                }
              }}
              onClick={async () => {
                if (isPreparingFullVideo) { return; }
                setIsPreparingFullVideo(true);
                try {
                  const previewVideo = videoRef.current;
                  const capabilityVideo = previewVideo ??
                    document.createElement('video');
                  const isMobile = window.matchMedia('(pointer: coarse)')
                    .matches || window.innerWidth < 768;
                  const selectedPlaybackUrl = selectInitialVideoPlaybackUrl({
                    sourceUrl: photo.url,
                    compatibilityUrl: compatibilityPlaybackUrl,
                    isMobile,
                    nativeMatroskaSupport: capabilityVideo.canPlayType(
                      'video/x-matroska',
                    ),
                  });
                  const preferCompatibility = Boolean(
                    compatibilityPlaybackUrl &&
                    selectedPlaybackUrl === compatibilityPlaybackUrl,
                  );
                  const preparedDownload = preparedFullVideoDownloads[
                    selectedPlaybackUrl
                  ];
                  const selectedDeliveryUrl = preparedDownload &&
                    preparedDownload.expiresAt > Date.now() + 10_000
                    ? preparedDownload.url
                    : getFullVideoBridgeUrl(selectedPlaybackUrl);
                  flushSync(() => {
                    setShouldUseCompatibilityPlayback(preferCompatibility);
                    setFullVideoDeliveryUrl(selectedDeliveryUrl);
                    setIsFullVideoPlaying(true);
                    setIsPiPLocked(false);
                  });
                  const video = videoRef.current;
                  if (!video) { return; }
                  await VideoPlaybackManager.requestPlay(video, {
                    preferPiP: VideoPlaybackManager.isPiPActive(),
                  });
                } finally {
                  setIsPreparingFullVideo(false);
                }
              }}
            >
              <span className={clsx(
                'inline-flex items-center justify-center rounded-full',
                'bg-black/70 text-white w-16 h-16',
                isPreparingFullVideo && 'animate-pulse',
              )}>
                <LuPlay size={28} />
              </span>
            </button>
          )}
        </div>}
      <div className={clsx(
        'absolute inset-0',
        'flex items-center justify-center',
        // Allow clicks to pass through to zoom controls
        // when not showing recipe overlay
        !(isShowingRecipeOverlay || shouldDebugRecipeOverlays) &&
          'pointer-events-none',
      )}>
        <AnimatePresence>
          {(isShowingRecipeOverlay || shouldDebugRecipeOverlays) &&
            photo.recipeData &&
            photo.film &&
              <MediaRecipeOverlay
                ref={refRecipe}
                title={photo.recipeTitle}
                data={photo.recipeData}
                film={photo.film}
                iso={photo.isoFormatted}
                exposure={photo.exposureCompensationFormatted}
                onClose={hideRecipeOverlay}
              />}
        </AnimatePresence>
      </div>
    </div>;

  const renderAdminMenu =
    <AdminMediaMenu {...{
      photo,
      revalidateMedia,
      includeFavorite: includeFavoriteInAdminMenu,
      ariaLabel: `Admin menu for '${titleForMedia(photo)}' photo`,
      showKeyCommands: showAdminKeyCommands,
    }} />;

  const largeMediaContainerClassName = clsx(
    areMediaMatted && 'flex items-center justify-center aspect-3/2',
    // Matte theme colors defined in root layout
    areMediaMatted && (MATTE_COLOR
      ? 'bg-(--matte-bg)'
      : 'bg-gray-100'),
    areMediaMatted && (MATTE_COLOR_DARK
      ? 'dark:bg-(--matte-bg-dark)'
      // Only specify dark background when MATTE_COLOR is not configured
      : !MATTE_COLOR && 'dark:bg-gray-700/30'),
  );
  const shouldWrapInLink = !showZoomControls && !isVideo;
  const hideFavoriteButton = isVideo && hasStartedMainVideoPlayback;

  const renderMediaWithFavorite = (media: ReactNode) =>
    <div
      className="relative"
      data-media-id={photo.id}
    >
      {media}
    </div>;

  const renderMetadataFavorite =
    <PersonalFavoriteButton
      mediaId={photo.id}
      hidden={hideFavoriteButton}
      inline
      className="size-7"
    />;

  return (
    <>
      <AppGrid
        containerRef={ref}
        className={className}
        contentMain={showZoomControls
          ? renderMediaWithFavorite(<div className={largeMediaContainerClassName}>
            {renderLargeMedia}
          </div>)
          : shouldWrapInLink
            ? renderMediaWithFavorite(<Link
              href={pathForMedia({ photo })}
              className={largeMediaContainerClassName}
              prefetch={prefetch}
            >
              {renderLargeMedia}
            </Link>)
            : renderMediaWithFavorite(<div className={largeMediaContainerClassName}>
              {renderLargeMedia}
            </div>)}
        classNameSide="relative"
        sideHiddenOnMobile={false}
        contentSide={
          <div className="md:absolute inset-0 -mt-1">
            <MaskedScroll className="sticky top-4 self-start">
              <DivDebugBaselineGrid className={clsx(
                'relative',
                'grid grid-cols-2 md:grid-cols-1',
                'gap-x-0.5 sm:gap-x-1 gap-y-baseline',
                'mb-6 md:mb-4',
              )}>
                <div className="absolute right-0 top-0 hidden items-center gap-1 md:flex">
                  {renderMetadataFavorite}
                  {renderAdminMenu}
                </div>
                {/* Meta */}
                <div className={clsx(
                  'pr-3 md:pr-7',
                  !hasTitleContent &&
                  !(
                    showCameraContent ||
                    showLensContent ||
                    showRecipeContent ||
                    showTagsContent ||
                    showVideoLibraryMeta
                  ) &&
                  'md:hidden',
                )}>
                  {hasTitle && (showTitleAsH1
                    ? <h1>{renderMediaLink}</h1>
                    : renderMediaLink)}
                  <div className={clsx(
                    'space-y-baseline',
                    hasTitle && !showTitleAsH1 && 'mt-1',
                  )}>
                    {showVideoLibraryMeta &&
                      <div className="space-y-1">
                        {videoLibraryCategories.length > 0 &&
                          <div className={clsx(
                            'flex flex-wrap gap-x-3 gap-y-1',
                            (
                              videoLibraryStudio ||
                              videoLibraryPerformers.length > 0 ||
                              videoLibraryContentTypes.length > 0
                            ) && 'mb-2',
                          )}>
                            {videoLibraryCategories.map(({ value, label }) =>
                              <MediaCategory
                                key={value}
                                category={value}
                                label={label}
                                contrast="medium"
                                hoverType="none"
                                className="shrink-0"
                              />)}
                          </div>}
                        {(videoLibraryStudio ||
                          videoLibraryPerformers.length > 0 ||
                          videoLibraryContentTypes.length > 0) &&
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {videoLibraryStudio &&
                              <MediaStudio
                                studio={videoLibraryStudio}
                                contrast="medium"
                                hoverType="none"
                                className="shrink-0"
                              />}
                            {videoLibraryPerformers.map(performer =>
                              <MediaPerformer
                                key={performer}
                                performer={performer}
                                contrast="medium"
                                hoverType="none"
                                className="shrink-0"
                              />)}
                            {videoLibraryContentTypes.map(({ value, label }) =>
                              <MediaContentType
                                key={value}
                                contentType={value}
                                label={label}
                                contrast="medium"
                                hoverType="none"
                                className="shrink-0"
                              />)}
                          </div>}
                      </div>}
                    {photo.caption &&
                    <div className="uppercase">
                      {photo.caption}
                    </div>}
                    {(
                      showCameraContent ||
                    showLensContent ||
                    showRecipeContent ||
                    showTagsContent ||
                    showVideoLibraryMeta
                    ) &&
                    <div>
                      {(showCameraContent || showLensContent) &&
                        <div className="flex flex-col *:self-start">
                          {showCameraContent &&
                            <MediaCamera
                              camera={mediaCamera}
                              contrast="medium"
                              prefetch={prefetchRelatedLinks}
                            />}
                          {showLensContent &&
                            <MediaLens
                              lens={mediaLens}
                              contrast="medium"
                              prefetch={prefetchRelatedLinks}
                            />}
                        </div>}
                      {showRecipeContent && recipeTitle &&
                        <MediaRecipe
                          ref={refMediaRecipe}
                          recipe={recipeTitle}
                          contrast="medium"
                          prefetch={prefetchRelatedLinks}
                          toggleRecipeOverlay={toggleRecipeOverlay}
                          isShowingRecipeOverlay={isShowingRecipeOverlay}
                        />}
                      {showTagsContent &&
                        <MediaTags
                          tags={tags}
                          contrast="medium"
                          prefetch={prefetchRelatedLinks}
                        />}
                    </div>}
                  </div>
                </div>
                {/* EXIF Data */}
                <div className={clsx(
                  'space-y-baseline',
                  !hasTitleContent && 'md:pr-7',
                )}>
                  <div className="float-end flex items-center gap-1 md:hidden">
                    {renderMetadataFavorite}
                    {renderAdminMenu}
                  </div>
                  {showVideoMeta &&
                  <ul className="text-medium space-y-1">
                    {videoDurationText &&
                      <li>
                        Duration · {videoDurationText}
                      </li>}
                    {videoResolutionText &&
                      <li>
                        Resolution · {videoResolutionText}
                      </li>}
                    {videoFrameRateText &&
                      <li>
                        Frame Rate · {videoFrameRateText} fps
                      </li>}
                    {displayTranscodeStatus &&
                      <li>
                        Status · {displayTranscodeStatus}
                        {photo.transcodeError &&
                          <Tooltip content={photo.transcodeError} sideOffset={4}>
                            <span className="ml-1 text-error underline decoration-dotted cursor-help">
                              Details
                            </span>
                          </Tooltip>}
                      </li>}
                  </ul>}
                  {showExifContent &&
                  <>
                    <ul className="text-medium">
                      <li>
                        {photo.focalLength &&
                          <Link
                            href={pathForFocalLength(photo.focalLength)}
                            className="hover:text-main active:text-medium"
                          >
                            {photo.focalLengthFormatted}
                          </Link>}
                        {(
                          photo.focalLengthIn35MmFormatFormatted &&
                          // eslint-disable-next-line max-len
                          photo.focalLengthIn35MmFormatFormatted !== photo.focalLengthFormatted
                        ) &&
                          <>
                            {' '}
                            <Tooltip
                              content={appText.tooltip['35mm']}
                              sideOffset={3}
                              supportMobile
                            >
                              <span
                                className={clsx(
                                  'text-extra-dim',
                                  'decoration-dotted underline-offset-[3px]',
                                  'hover:underline',
                                )}
                              >
                                {photo.focalLengthIn35MmFormatFormatted}
                              </span>
                            </Tooltip>
                          </>}
                      </li>
                      <li>{photo.fNumberFormatted}</li>
                      <li>{photo.exposureTimeFormatted}</li>
                      <li>{photo.isoFormatted}</li>
                      <li>{photo.exposureCompensationFormatted ?? '0ev'}</li>
                    </ul>
                    {showFilmContent && photo.film &&
                      <MediaFilm
                        ref={refMediaFilm}
                        film={photo.film}
                        prefetch={prefetchRelatedLinks}
                        {...photo.recipeData && !photo.recipeTitle && {
                          toggleRecipeOverlay,
                          isShowingRecipeOverlay,
                        }}
                      />}
                  </>}
                  <div className={clsx(
                    'flex gap-x-3 gap-y-baseline',
                    'md:flex-col flex-wrap',
                    'md:justify-normal',
                  )}>
                    <MediaDate
                      photo={photo}
                      className={clsx(
                        'text-medium',
                        // Prevent collision with admin button
                        !hasNonDateContent && isUserSignedIn && 'md:pr-7',
                      )}
                      // 'createdAt' is a naive datetime which does not require
                      // a timezone and will not cause server/client mismatch
                      timezone={null}
                      hideTime={!SHOW_TAKEN_AT_TIME}
                    />
                    <div className={clsx(
                      'flex gap-1 translate-y-[0.5px]',
                      'translate-x-[-2.5px]',
                      'relative z-10',
                    )}>
                      {showZoomControls ?
                        <LoaderButton
                          tooltip={appText.tooltip.zoom}
                          icon={<LuExpand size={15} />}
                          onClick={() => refZoomControls.current?.open()}
                          styleAs="link"
                          className="text-medium translate-y-[0.25px]"
                          hideFocusOutline
                        />
                        : isVideo &&
                        <LoaderButton
                          tooltip={appText.tooltip.zoom}
                          icon={<LuExpand size={15} />}
                          onClick={() => {
                            const video = videoRef.current;
                            if (video) {
                              setZoomStartTime(video.currentTime || 0);
                              setLastInlineWasPlaying(
                                !video.paused && !video.ended,
                              );
                              try { video.pause(); } catch {}
                            } else {
                              setZoomStartTime(undefined);
                              setLastInlineWasPlaying(false);
                            }
                            setIsVideoZoomOpen(true);
                          }}
                          styleAs="link"
                          className="text-medium translate-y-[0.25px]"
                          hideFocusOutline
                        />}
                      {isVideo && canUsePiP && (
                        <LoaderButton
                          tooltip={'Picture in Picture'}
                          icon={<LuPictureInPicture size={15} />}
                          onClick={async () => {
                            const video = videoRef.current;
                            if (!video) { return; }
                            if (!isFullVideoPlaying) {
                              setIsFullVideoPlaying(true);
                              requestAnimationFrame(() => {
                                const fullVideo = videoRef.current;
                                if (!fullVideo) { return; }
                                const open = async () => {
                                  setIsPiPLocked(false);
                                  await VideoPlaybackManager.togglePiP(fullVideo);
                                };
                                if (fullVideo.readyState >= 2) {
                                  void open();
                                } else {
                                  fullVideo.addEventListener(
                                    'loadeddata',
                                    open,
                                    { once: true },
                                  );
                                  try { fullVideo.load(); } catch {}
                                }
                              });
                            } else {
                              await VideoPlaybackManager.togglePiP(video);
                            }
                          }}
                          styleAs="link"
                          className="text-medium translate-y-[0.25px]"
                          hideFocusOutline
                        />
                      )}
                      {shouldShare &&
                      <ShareButton
                        tooltip={appText.tooltip.shareMedia}
                        photo={photo}
                        recent={shouldShareRecents
                          ? recent
                          : undefined}
                        year={shouldShareYear
                          ? year
                          : undefined}
                        album={shouldShareAlbum
                          ? album
                          : undefined}
                        tag={shouldShareTag
                          ? primaryTag
                          : undefined}
                        camera={shouldShareCamera
                          ? mediaCamera
                          : undefined}
                        lens={shouldShareLens
                          ? mediaLens
                          : undefined}
                        film={shouldShareFilm
                          ? photo.film
                          : undefined}
                        recipe={shouldShareRecipe
                          ? recipeTitle
                          : undefined}
                        focal={shouldShareFocalLength
                          ? photo.focalLength
                          : undefined}
                        prefetch={prefetchRelatedLinks}
                      />}
                      {isVideo && (subtitleTracks?.length ?? 0) > 0 && (
                        <LoaderButton
                          tooltip={captionsOn ? 'Hide Subtitles' : 'Show Subtitles'}
                          icon={captionsOn
                            ? <LuCaptions size={15} />
                            : <LuCaptionsOff size={15} />}
                          onClick={toggleCaptions}
                          styleAs="link"
                          className="text-medium translate-y-[0.25px]"
                          hideFocusOutline
                        />
                      )}
                      {isVideo && (subtitleTracks?.length ?? 0) >= 1 && (
                        <div className="relative overflow-visible">
                          <button
                            type="button"
                            aria-label="Subtitle language"
                            className={clsx(
                              'inline-flex h-5 max-w-28 items-center gap-0.5',
                              'truncate rounded px-1 text-xs leading-none',
                              'text-medium -translate-y-px',
                              'hover:underline focus:outline-none',
                            )}
                            ref={langBtnRef}
                            onClick={() => {
                              setIsLangMenuOpen(v => {
                                const next = !v;
                                if (next) { setLangMenuIgnoreUntil(Date.now() + 250); }
                                return next;
                              });
                              try {
                                const r = langBtnRef.current?.getBoundingClientRect();
                                if (r) { setLangMenuRect({ top: r.bottom - 2, left: r.right, width: r.width }); }
                              } catch {}
                            }}
                          >
                            {(() => {
                              const t = (subtitleTracks || [])[activeCaptionIndex];
                              return (t?.label || t?.lang || `Track ${activeCaptionIndex + 1}`);
                            })()}
                            {isLangMenuOpen
                              ? <LuChevronUp className="shrink-0" size={12} />
                              : <LuChevronDown className="shrink-0" size={12} />}
                          </button>
                          {isLangMenuOpen && langMenuRect && typeof document !== 'undefined' && createPortal(
                            <div
                              className={clsx(
                                'z-[2000] min-w-[136px] max-h-24',
                                'overflow-auto overscroll-contain rounded',
                                'bg-main p-1 text-xs shadow-md',
                              )}
                              data-subtitle-lang-menu
                              style={{ position: 'fixed', top: langMenuRect.top, left: Math.max(8, langMenuRect.left - 160) }}
                            >
                              {(subtitleTracks || []).map((t: any, i: number) => (
                                <button
                                  key={`${t.src}-${i}`}
                                  type="button"
                                  className={clsx(
                                    'block w-full text-left px-2 py-1 rounded',
                                    i === activeCaptionIndex ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                                  )}
                                  onClick={() => {
                                    if (Date.now() < langMenuIgnoreUntil) { return; }
                                    changeCaptionLanguage(i);
                                    setIsLangMenuOpen(false);
                                  }}
                                >
                                  {t.label || t.lang || `Track ${i + 1}`}
                                </button>
                              ))}
                            </div>,
                            document.body,
                          )}
                        </div>
                      )}
                      {ALLOW_PUBLIC_DOWNLOADS && !isVideo &&
                      <DownloadButton
                        className="translate-y-[0.5px] md:translate-y-0"
                        photo={photo}
                      />}
                    </div>
                  </div>
                </div>
              </DivDebugBaselineGrid>
            </MaskedScroll>
          </div>}
      />
      {isVideo &&
      <VideoZoomOverlay
        open={isVideoZoomOpen}
        onClose={() => setIsVideoZoomOpen(false)}
        videoUrl={photo.url}
        playbackUrl={getFullVideoBridgeUrl(photo.url)}
        manifestUrl={fullVideoManifestUrl}
        mediaId={photo.id}
        compatibilityUrl={fullVideoCompatibilityUrl}
        posterUrl={posterSrc ?? undefined}
        onPlayManaged={async (videoEl) => {
          await VideoPlaybackManager.requestPlay(videoEl, { preferPiP: VideoPlaybackManager.isPiPActive() });
        }}
        startTime={zoomStartTime}
        captionsOn={captionsOn}
        subtitleTracks={subtitleTracks ?? undefined}
        activeCaptionIndex={activeCaptionIndex}
        onCloseWithState={(state) => {
          const v = videoRef.current;
          if (!v) { return; }
          try { v.currentTime = state.currentTime || 0; } catch {}
          if (lastInlineWasPlaying) {
            v.play?.().catch(() => {});
          }
        }}
      />}
    </>
  );
};

function VideoZoomOverlay({
  open,
  onClose,
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
  onCloseWithState,
}: {
  open: boolean
  onClose: () => void
  videoUrl: string
  playbackUrl?: string
  manifestUrl?: string
  mediaId?: string
  compatibilityUrl?: string
  posterUrl?: string
  onPlayManaged?: (video: HTMLVideoElement) => void
  startTime?: number
  captionsOn?: boolean
  subtitleTracks?: { src: string, lang: string, label?: string }[]
  activeCaptionIndex?: number
  onCloseWithState?: (state: { currentTime: number, wasPlaying: boolean }) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [wasPlaying, setWasPlaying] = useState(true);
  const progressiveUrlRef = useRef<{ source: string, url: string } | undefined>(undefined);
  const activePlaybackUrl = playbackUrl ?? videoUrl;
  const activeManifestUrl = open && manifestUrl
    ? getFullVideoBridgeUrl(manifestUrl)
    : undefined;
  const progressiveUrl = progressiveUrlRef.current?.source === activePlaybackUrl
    ? progressiveUrlRef.current.url
    : undefined;
  useAdaptiveFullVideoPlayback({
    active: open,
    videoRef,
    sourceUrl: activePlaybackUrl,
    compatibilityUrl,
    manifestUrl: activeManifestUrl,
    onTelemetry: (telemetry) => {
      try {
        window.dispatchEvent(new CustomEvent('media-full-video-telemetry', {
          detail: { mediaId, ...telemetry },
        }));
      } catch { /* page may be tearing down */ }
    },
    onProgressiveFallback: (url) => {
      progressiveUrlRef.current = { source: activePlaybackUrl, url };
    },
  });
  useEffect(() => {
    if (!open) { return; }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) { return; }
    const v = videoRef.current;
    if (!v) { return; }
    const onLoaded = () => {
      if (typeof startTime === 'number' && Number.isFinite(startTime)) {
        try { v.currentTime = Math.max(0, startTime); } catch {}
      }
      v.play?.().catch(() => {});
      if (v.textTracks && v.textTracks.length > 0) {
        for (let i = 0; i < v.textTracks.length; i++) {
          v.textTracks[i].mode = captionsOn && i === (activeCaptionIndex ?? 0) ? 'showing' : 'hidden';
        }
      }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    const onPlay = () => setWasPlaying(true);
    const onPause = () => setWasPlaying(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [open, startTime, captionsOn]);

  // React to external toggle changes while overlay is open
  useEffect(() => {
    if (!open) { return; }
    const v = videoRef.current;
    if (!v || !v.textTracks) { return; }
    try {
      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = captionsOn && i === (activeCaptionIndex ?? 0) ? 'showing' : 'hidden';
      }
    } catch { /* ignore */ }
  }, [open, captionsOn]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={() => {
        const v = videoRef.current;
        onCloseWithState?.({ currentTime: v?.currentTime || 0, wasPlaying });
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-5xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Close via backdrop click or Escape key; remove visible label */}
        <video
          ref={videoRef}
          className="w-full h-full max-h-[80vh] object-contain rounded-md bg-black"
          src={progressiveUrl ?? activePlaybackUrl}
          poster={posterUrl}
          controls
          controlsList="nodownload noplaybackrate"
          autoPlay
          playsInline
          onContextMenu={(e) => e.preventDefault()}
          crossOrigin="anonymous"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget as HTMLVideoElement;
            if (typeof startTime === 'number' && Number.isFinite(startTime)) {
              try { v.currentTime = Math.max(0, startTime); } catch {}
            }
            if (v.textTracks && v.textTracks.length > 0) {
              for (let i = 0; i < v.textTracks.length; i++) {
                v.textTracks[i].mode = captionsOn && i === (activeCaptionIndex ?? 0) ? 'showing' : 'hidden';
              }
            }
          }}
          onPlay={(e) => {
            const el = e.currentTarget as HTMLVideoElement;
            onPlayManaged?.(el);
          }}
        >
          {(() => {
            const tracks = (subtitleTracks && subtitleTracks.length > 0)
              ? subtitleTracks
              : (() => {
                const actualUrl = videoUrl;
                const base = (() => {
                  try {
                    const { pathname } = new URL(actualUrl);
                    const last = pathname.split('/').pop() || '';
                    return actualUrl.replace(last, (last.split('.').slice(0, -1).join('.')) || last);
                  } catch {
                    const pathOnly = actualUrl.split('?')[0] ?? actualUrl;
                    const parts = pathOnly.split('/');
                    const file = parts.pop() || '';
                    const baseNoExt = file.includes('.') ? file.substring(0, file.lastIndexOf('.')) : file;
                    return [...parts, baseNoExt].join('/');
                  }
                })();
                return [{ src: `${base}-subtitles.vtt`, lang: 'default', label: 'Subtitles' }];
              })();
            return <>
              {tracks.map((t: any, i: number) => (
                <track
                  key={`${t.src}-${i}`}
                  kind="captions"
                  src={t.src}
                  srcLang={t.lang}
                  label={t.label || t.lang}
                  {...(captionsOn && i === (activeCaptionIndex ?? 0) ? { default: true } : {})}
                />
              ))}
            </>;
          })()}
        </video>
      </div>
    </div>,
    document.body,
  );
}
