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

const OPTIMIZED_IMAGE_FALLBACK_DELAY_MS = 250;

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
  const [isDirectFallback, setIsDirectFallback] = useState(false);
  const [hasLoadedImage, setHasLoadedImage] = useState(false);
  const [fadeFallbackTransition, setFadeFallbackTransition] =
    useState(!hasLoadedWithAnimations);
  const directFallbackSrc = fallbackToUnoptimized &&
    typeof props.src === 'string'
    ? props.src
    : undefined;

  useEffect(() => {
    if (
      !directFallbackSrc ||
      unoptimized ||
      hasLoadedImage ||
      (!priority && props.loading === 'lazy')
    ) {
      return;
    }

    // Warm the direct storage URL in parallel. If the optimizer is over quota
    // or slow, switching to this already-started request stays immediate.
    const directImage = new window.Image();
    directImage.decoding = 'async';
    directImage.fetchPriority = priority ? 'high' : 'auto';
    directImage.src = directFallbackSrc;
    return () => {
      directImage.onload = null;
      directImage.onerror = null;
    };
  }, [directFallbackSrc, hasLoadedImage, priority, props.loading, unoptimized]);

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      setIsLoading(false);
      setDidError(false);
      setHasLoadedImage(true);
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
        setIsDirectFallback(true);
        setIsLoading(true);
        setDidError(false);
        setHasLoadedImage(false);
        return;
      }
      setDidError(true);
      onImageError?.(event);
    },
    [fallbackToUnoptimized, isDirectFallback, onImageError],
  );

  useEffect(() => {
    if (
      !fallbackToUnoptimized ||
      unoptimized ||
      isDirectFallback ||
      hasLoadedImage
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsDirectFallback(true);
      setIsLoading(true);
      setDidError(false);
      setHasLoadedImage(false);
    }, OPTIMIZED_IMAGE_FALLBACK_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [fallbackToUnoptimized, hasLoadedImage, isDirectFallback, unoptimized]);

  useEffect(() => {
    const image = ref.current;
    const syncLoadedState = () => {
      if (isImageLoaded(image)) {
        setIsLoading(false);
        setHasLoadedImage(true);
      }
    };
    if (isImageLoaded(image)) {
      // Eager offscreen images can finish before React attaches onLoad. Sync
      // from the DOM so their fallback cannot remain over a decoded image.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      setHasLoadedImage(true);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        key: isDirectFallback ? 'direct' : 'optimized',
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
