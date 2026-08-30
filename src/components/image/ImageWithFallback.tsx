'use client';

/* eslint-disable jsx-a11y/alt-text */
import { BLUR_ENABLED } from '@/app/config';
import { useAppState } from '@/app/AppState';
import { clsx}  from 'clsx/lite';
import Image, { ImageProps } from 'next/image';
import {
  RefObject,
  startTransition,
  SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import Spinner from '../Spinner';
import { isImageLoaded } from './image-loading';

// Remember optimizer failures for the lifetime of this page. A card that is
// remounted after scrolling should go straight to storage instead of spending
// another request on a transformation that already failed for this source.
// This is intentionally per source: cached transformed images can still load
// even after a different, uncached transformation has exceeded Vercel quota.
const MAX_REMEMBERED_DIRECT_FALLBACK_SOURCES = 512;
const directFallbackSources = new Set<string>();
let isImageOptimizerUnavailable = false;
const IMAGE_OPTIMIZER_UNAVAILABLE_SESSION_KEY =
  'media-panel:image-optimizer-unavailable';

// A public grid can contain hundreds of images. One ResizeObserver and one
// pageshow listener per card created a resume storm on mobile browsers. Share
// one observer and batch changed images into a single animation frame.
const imageStateSyncCallbacks = new Map<HTMLImageElement, () => void>();
const pendingImageStateSyncs = new Set<HTMLImageElement>();
let sharedImageResizeObserver: ResizeObserver | undefined;
let imageStateSyncFrame: number | undefined;

const flushPendingImageStateSyncs = () => {
  imageStateSyncFrame = undefined;
  const images = [...pendingImageStateSyncs];
  pendingImageStateSyncs.clear();
  images.forEach(image => imageStateSyncCallbacks.get(image)?.());
};

const getSharedImageResizeObserver = () => {
  if (typeof ResizeObserver === 'undefined') { return undefined; }
  sharedImageResizeObserver ??= new ResizeObserver(entries => {
    entries.forEach(entry => {
      if (entry.target instanceof HTMLImageElement) {
        pendingImageStateSyncs.add(entry.target);
      }
    });
    if (imageStateSyncFrame === undefined) {
      imageStateSyncFrame = window.requestAnimationFrame(
        flushPendingImageStateSyncs,
      );
    }
  });
  return sharedImageResizeObserver;
};

const observeImageState = (
  image: HTMLImageElement,
  sync: () => void,
) => {
  imageStateSyncCallbacks.set(image, sync);
  getSharedImageResizeObserver()?.observe(image);
  return () => {
    sharedImageResizeObserver?.unobserve(image);
    imageStateSyncCallbacks.delete(image);
    pendingImageStateSyncs.delete(image);
    if (imageStateSyncCallbacks.size === 0) {
      sharedImageResizeObserver?.disconnect();
      sharedImageResizeObserver = undefined;
      if (imageStateSyncFrame !== undefined) {
        window.cancelAnimationFrame(imageStateSyncFrame);
        imageStateSyncFrame = undefined;
      }
      pendingImageStateSyncs.clear();
    }
  };
};

const rememberImageOptimizerUnavailable = () => {
  if (isImageOptimizerUnavailable) { return; }
  isImageOptimizerUnavailable = true;
  try {
    window.sessionStorage.setItem(
      IMAGE_OPTIMIZER_UNAVAILABLE_SESSION_KEY,
      '1',
    );
  } catch { /* storage can be unavailable in privacy mode */ }
};

const wasImageOptimizerUnavailableInSession = () => {
  if (isImageOptimizerUnavailable) { return true; }
  try {
    if (window.sessionStorage.getItem(
      IMAGE_OPTIMIZER_UNAVAILABLE_SESSION_KEY,
    ) === '1') {
      isImageOptimizerUnavailable = true;
      return true;
    }
  } catch { /* storage can be unavailable in privacy mode */ }
  return false;
};

const rememberDirectFallbackSource = (src: string) => {
  directFallbackSources.delete(src);
  directFallbackSources.add(src);
  while (directFallbackSources.size > MAX_REMEMBERED_DIRECT_FALLBACK_SOURCES) {
    const oldestSrc = directFallbackSources.values().next().value;
    if (typeof oldestSrc !== 'string') { break; }
    directFallbackSources.delete(oldestSrc);
  }
};

export default function ImageWithFallback({
  ref: refProp,
  className,
  classNameImage = 'object-cover h-full',
  blurDataURL,
  blurCompatibilityLevel = 'low',
  classNameFallback,
  priority,
  unoptimized = false,
  fallbackToUnoptimized = false,
  onLoad: onImageLoad,
  onError: onImageError,
  showLoadingIndicator = false,
  ...props
}: ImageProps & {
  ref?: RefObject<HTMLImageElement | null>
  blurCompatibilityLevel?: 'none' | 'low' | 'high'
  classNameImage?: string
  classNameFallback?: string
  fallbackToUnoptimized?: boolean
  showLoadingIndicator?: boolean
}) {
  const ref = useRef<HTMLImageElement>(null);
  const hasLoadedRef = useRef(false);

  const { hasLoadedWithAnimations, shouldDebugImageFallbacks } = useAppState();

  const [isLoading, setIsLoading] = useState(true);
  const [didError, setDidError] = useState(false);
  const [isDirectFallback, setIsDirectFallback] = useState(() =>
    fallbackToUnoptimized && typeof props.src === 'string' && (
      directFallbackSources.has(props.src)
    ),
  );
  const [fadeFallbackTransition, setFadeFallbackTransition] =
    useState(!hasLoadedWithAnimations);
  const directFallbackSrc = fallbackToUnoptimized &&
    typeof props.src === 'string'
    ? props.src
    : undefined;

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      hasLoadedRef.current = true;
      // Image completion is a visual refinement, not an input-blocking
      // update. Large grids can finish many cached/direct images in the same
      // task; keep those commits interruptible so navigation and filter taps
      // remain responsive while the grid settles.
      startTransition(() => {
        setIsLoading(false);
        setDidError(false);
      });
      if (isDirectFallback && directFallbackSrc) {
        // A successful direct retry proves storage is healthy and the failed
        // transformed request was the delivery layer. New cards in this
        // browser session now give a cached transform one frame to resolve,
        // then skip the unavailable optimizer and use storage directly.
        rememberDirectFallbackSource(directFallbackSrc);
        rememberImageOptimizerUnavailable();
      }
      onImageLoad?.(event);
    },
    [directFallbackSrc, isDirectFallback, onImageLoad],
  );

  useLayoutEffect(() => {
    if (!fallbackToUnoptimized || !directFallbackSrc || isDirectFallback) {
      return;
    }
    let fallbackFrame: number | undefined;
    const getImage = () => refProp?.current ?? ref.current;
    const cancelFallback = () => {
      if (fallbackFrame === undefined) { return; }
      window.cancelAnimationFrame(fallbackFrame);
      fallbackFrame = undefined;
    };
    const scheduleDirectUnlessOptimizedImageIsReady = () => {
      cancelFallback();
      // Give a transformed response already present in the browser HTTP cache
      // one paint opportunity to complete. If it is not ready by then, avoid
      // waiting on a quota-limited optimizer and request storage directly.
      fallbackFrame = window.requestAnimationFrame(() => {
        fallbackFrame = undefined;
        if (hasLoadedRef.current || isImageLoaded(getImage())) { return; }
        rememberDirectFallbackSource(directFallbackSrc);
        hasLoadedRef.current = false;
        setIsLoading(true);
        setDidError(false);
        setIsDirectFallback(true);
      });
    };
    if (wasImageOptimizerUnavailableInSession()) {
      scheduleDirectUnlessOptimizedImageIsReady();
    }
    return () => {
      cancelFallback();
    };
  }, [directFallbackSrc, fallbackToUnoptimized, isDirectFallback, refProp]);
  const onError = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      hasLoadedRef.current = false;
      if (fallbackToUnoptimized && !isDirectFallback) {
        // A transformed image can fail because the optimizer is unavailable or
        // over quota even though the stable storage object is healthy. Retry the
        // same URL directly before showing the permanent image fallback.
        if (directFallbackSrc) {
          rememberDirectFallbackSource(directFallbackSrc);
        }
        setIsDirectFallback(true);
        setIsLoading(true);
        setDidError(false);
        return;
      }
      setDidError(true);
      onImageError?.(event);
    },
    [
      directFallbackSrc,
      fallbackToUnoptimized,
      isDirectFallback,
      onImageError,
    ],
  );

  useEffect(() => {
    const image = refProp?.current ?? ref.current;
    const syncLoadedState = () => {
      if (isImageLoaded(image)) {
        startTransition(() => setIsLoading(false));
      }
    };
    if (isImageLoaded(image)) {
      // Eager offscreen images can finish before React attaches onLoad. Sync
      // from the DOM so their fallback cannot remain over a decoded image.
      startTransition(() => setIsLoading(false));
    } else {
      setFadeFallbackTransition(true);
    }

    // Grid-mode changes resize already-mounted lazy images. Some mobile
    // compositors decode those images during the geometry change without
    // delivering another React load event, leaving the opaque fallback over
    // a valid bitmap until refresh. Reconcile from the actual image element
    // whenever its rendered box changes.
    return image ? observeImageState(image, syncLoadedState) : undefined;
  }, [refProp]);

  const getBlurClass = () => {
    switch (blurCompatibilityLevel) {
      case 'high':
      // Fix poorly blurred placeholder data generated on client
        return 'blur-[4px] @xs:blue-md scale-[1.05]';
      case 'low':
        return 'blur-[2px] @xs:blue-md scale-[1.01]';
    }
  };

  return (
    <div
      className={clsx(
        'flex relative',
        className,
      )}
    >
      <Image ref={refProp ?? ref} {...{
        ...props,
        priority,
        unoptimized: unoptimized || isDirectFallback,
        className: classNameImage,
        onLoad,
        onError,
      }} />
      <div
        className={clsx(
          '@container',
          'absolute inset-0 pointer-events-none',
          'overflow-hidden',
          fadeFallbackTransition &&
            'transition-opacity duration-300 ease-in',
          !(BLUR_ENABLED && blurDataURL) &&
            (classNameFallback ?? 'bg-main'),
          (isLoading || didError || shouldDebugImageFallbacks)
            ? 'opacity-100'
            : 'opacity-0',
        )}
      >
        {(BLUR_ENABLED && blurDataURL)
          ? <img {...{
            ...props,
            src: blurDataURL,
            className: clsx(
              getBlurClass(),
              classNameImage,
            ),
          }} />
          :  <div className={clsx(
            'w-full h-full',
            classNameFallback ?? 'bg-gray-100/50 dark:bg-gray-900/50',
          )} />}
      </div>
      {showLoadingIndicator && isLoading && !didError &&
        <span className={clsx(
          'absolute inset-0 z-10 flex items-center justify-center',
          'pointer-events-none',
        )}>
          <Spinner size={16} color="semi-transparent" />
        </span>}
    </div>
  );
}
