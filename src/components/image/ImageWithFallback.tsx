'use client';

/* eslint-disable jsx-a11y/alt-text */
import { BLUR_ENABLED } from '@/app/config';
import { useAppState } from '@/app/AppState';
import { clsx}  from 'clsx/lite';
import Image, { ImageProps } from 'next/image';
import {
  RefObject,
  SyntheticEvent,
  useCallback,
  useEffect,
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
const directFallbackSources = new Set<string>();

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

  const { hasLoadedWithAnimations, shouldDebugImageFallbacks } = useAppState();

  const [isLoading, setIsLoading] = useState(true);
  const [didError, setDidError] = useState(false);
  const [isDirectFallback, setIsDirectFallback] = useState(() =>
    typeof props.src === 'string' && directFallbackSources.has(props.src),
  );
  const [fadeFallbackTransition, setFadeFallbackTransition] =
    useState(!hasLoadedWithAnimations);
  const directFallbackSrc = fallbackToUnoptimized &&
    typeof props.src === 'string'
    ? props.src
    : undefined;

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      setIsLoading(false);
      setDidError(false);
      onImageLoad?.(event);
    },
    [onImageLoad],
  );
  const onError = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      if (fallbackToUnoptimized && !isDirectFallback) {
        // A transformed image can fail because the optimizer is unavailable or
        // over quota even though the stable storage object is healthy. Retry the
        // same URL directly before showing the permanent image fallback.
        if (directFallbackSrc) {
          directFallbackSources.add(directFallbackSrc);
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
    const image = ref.current;
    const syncLoadedState = () => {
      if (isImageLoaded(image)) {
        setIsLoading(false);
      }
    };
    if (isImageLoaded(image)) {
      // Eager offscreen images can finish before React attaches onLoad. Sync
      // from the DOM so their fallback cannot remain over a decoded image.
      setIsLoading(false);
    } else {
      setFadeFallbackTransition(true);
    }

    // Grid-mode changes resize already-mounted lazy images. Some mobile
    // compositors decode those images during the geometry change without
    // delivering another React load event, leaving the opaque fallback over
    // a valid bitmap until refresh. Reconcile from the actual image element
    // whenever its rendered box changes.
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncLoadedState)
      : undefined;
    if (image) { resizeObserver?.observe(image); }
    window.addEventListener('pageshow', syncLoadedState);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('pageshow', syncLoadedState);
    };
  }, []);

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
