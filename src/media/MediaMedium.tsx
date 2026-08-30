'use client';

import {
  Media,
  altTextForMedia,
  doesMediaNeedBlurCompatibility,
  getMediaPosterUrl,
  getMediaPreviewUrl,
  getMediaAspectRatio,
  isVideoMedia,
} from '.';
import { MediaSetCategory } from '../category';
import ImageMedium from '@/components/image/ImageMedium';
import { clsx } from 'clsx/lite';
import { pathForMedia } from '@/app/path';
import { useRef, useState } from 'react';
import useVisibility from '@/utility/useVisibility';
import LinkWithStatus from '@/components/LinkWithStatus';
import Spinner from '@/components/Spinner';
import MediaColors from './color/MediaColors';
import useVideoPreviewLifecycle from './video-preview-lifecycle';
import useMediaPreload from './useMediaPreload';
import InlineVideoPreview from './InlineVideoPreview';
import { rememberMediaScrollPosition } from './useMediaScrollRestoration';

export default function MediaMedium({
  photo,
  selected,
  priority,
  prefetch,
  className,
  onVisible,
  debugColor,
  enableVideoPreview = true,
  initiallyLoadPreviewImage = false,
  preloadVideoPreview = false,
  autoPreviewEnabled = true,
  mountPreviewOnlyWhenVisible = false,
  hoverPreviewEnabled = false,
  ...categories
}: {
  photo: Media
  selected?: boolean
  priority?: boolean
  prefetch?: boolean
  className?: string
  onVisible?: () => void
  debugColor?: boolean
  enableVideoPreview?: boolean
  initiallyLoadPreviewImage?: boolean
  preloadVideoPreview?: boolean
  autoPreviewEnabled?: boolean
  mountPreviewOnlyWhenVisible?: boolean
  hoverPreviewEnabled?: boolean
} & MediaSetCategory) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [videoFailedMediaId, setVideoFailedMediaId] = useState<string>();
  const [posterFailedMediaId, setPosterFailedMediaId] = useState<string>();
  const hasVideoFailed = videoFailedMediaId === photo.id;
  const hasPosterFailed = posterFailedMediaId === photo.id;
  const posterSrc = getMediaPosterUrl(photo);
  const previewSrc = getMediaPreviewUrl(photo);
  const {
    shouldMount: shouldMountPreview,
    isActive: isPreviewActive,
    isExiting: isPreviewExiting,
  } = useVideoPreviewLifecycle({
    ref,
    enabled: Boolean(
      isVideoMedia(photo) &&
      enableVideoPreview &&
      (autoPreviewEnabled || (hoverPreviewEnabled && isHovered)) &&
      previewSrc &&
      !hasVideoFailed,
    ),
    preloadEnabled: Boolean(
      isVideoMedia(photo) &&
      enableVideoPreview &&
      preloadVideoPreview &&
      !mountPreviewOnlyWhenVisible &&
      previewSrc &&
      !hasVideoFailed,
    ),
    mountOnlyWhenVisible: mountPreviewOnlyWhenVisible,
    preloadUrl: previewSrc,
  });
  const shouldRenderPreview = shouldMountPreview || isPreviewExiting;
  const { shouldLoad: shouldLoadMediaImage } = useMediaPreload({
    ref,
    // Prepare several rows ahead so fast scrolls do not outrun image fetches.
    // Keep several rows prepared even on large/high-density displays so a
    // fast scroll does not reach a card before its image element is promoted
    // out of native lazy-loading.
    preloadAheadPx: 3200,
    releaseBehindPx: 1200,
  });
  // Keep image/poster elements mounted from the first render. Native lazy
  // loading still bounds network work; once a card enters the preload range,
  // promote it to eager so returning upward is immediate as well.
  const eagerPreviewImage = Boolean(priority) ||
    initiallyLoadPreviewImage ||
    shouldLoadMediaImage;

  useVisibility({
    ref,
    onVisible,
  });

  return (
    <LinkWithStatus
      ref={ref}
      href={pathForMedia({ photo, ...categories })}
      data-media-id={photo.id}
      className={clsx(
        'group',
        'active:brightness-75',
        selected && 'brightness-50',
        className,
      )}
      prefetch={prefetch}
      flickerThreshold={0}
      onClick={event => rememberMediaScrollPosition(photo.id, event.currentTarget)}
      onPointerEnter={event => event.pointerType === 'mouse' && setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {({ isLoading }) =>
        <div className="w-full h-full">
          {isLoading &&
            <div className={clsx(
              'absolute inset-0 flex items-center justify-center',
              'text-white',
              'animate-fade-in',
              'z-10',
            )}>
              <Spinner size={20} color="text" />
            </div>}
          {debugColor && photo.colorData &&
            <div className={clsx(
              'absolute inset-2 z-10',
              'opacity-0 group-hover:opacity-100 transition-opacity',
            )}>
              <MediaColors
                className="justify-end"
                colorData={photo.colorData}
              />
            </div>}
          {isVideoMedia(photo)
            ? <div
              className={clsx(
                'relative w-full h-full overflow-hidden',
                'bg-dim',
              )}
              style={{ aspectRatio: getMediaAspectRatio(photo) }}
            >
              {posterSrc && !hasPosterFailed
                ? <ImageMedium
                  src={posterSrc}
                  // Use the optimized poster when available, then fall back
                  // to the stable Drive/R2 URL if the optimizer rejects it.
                  fallbackToUnoptimized
                  aspectRatio={getMediaAspectRatio(photo)}
                  alt={altTextForMedia(photo)}
                  className="absolute inset-0 w-full h-full"
                  classNameImage="w-full h-full object-cover"
                  loading={eagerPreviewImage ? 'eager' : 'lazy'}
                  fetchPriority={priority ? 'high' : 'auto'}
                  onError={() => setPosterFailedMediaId(photo.id)}
                  showLoadingIndicator
                />
                : <div className="absolute inset-0 bg-dim" />}
              {shouldRenderPreview && previewSrc && !hasVideoFailed && (
                <InlineVideoPreview
                  src={previewSrc}
                  active={isPreviewActive}
                  onError={() => setVideoFailedMediaId(photo.id)}
                />
              )}
              <div
                className={clsx(
                  'absolute inset-0 pointer-events-none',
                  'transition-opacity duration-200',
                  shouldRenderPreview && !hasVideoFailed
                    ? 'opacity-0 group-hover:opacity-20'
                    : 'opacity-100',
                  'bg-gradient-to-b from-black/30 via-black/10 to-black/40',
                )}
              />
            </div>
            : <ImageMedium
                src={photo.url}
                aspectRatio={photo.aspectRatio}
                blurDataURL={photo.blurData}
                blurCompatibilityMode={doesMediaNeedBlurCompatibility(photo)}
                className="flex object-cover w-full h-full"
                classNameImage="object-cover w-full h-full"
                alt={altTextForMedia(photo)}
                priority={priority}
                loading={eagerPreviewImage ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                showLoadingIndicator
              />}
        </div>}
    </LinkWithStatus>
  );
};
