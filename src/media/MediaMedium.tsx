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
      previewSrc &&
      !hasVideoFailed,
    ),
    preloadUrl: previewSrc,
  });
  const shouldRenderPreview = shouldMountPreview || isPreviewExiting;
  const { shouldLoad: shouldLoadMediaImage } = useMediaPreload({ ref });
  const shouldLoadPreviewImage = Boolean(priority) ||
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
      className={clsx(
        'group',
        'active:brightness-75',
        selected && 'brightness-50',
        className,
      )}
      prefetch={prefetch}
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
              {posterSrc && !hasPosterFailed && shouldLoadPreviewImage
                ? <ImageMedium
                  src={posterSrc}
                  aspectRatio={getMediaAspectRatio(photo)}
                  alt={altTextForMedia(photo)}
                  className="absolute inset-0 w-full h-full"
                  classNameImage="w-full h-full object-cover"
                  loading={priority ? 'eager' : 'lazy'}
                  fetchPriority={priority ? 'high' : 'low'}
                  onError={() => setPosterFailedMediaId(photo.id)}
                  showLoadingIndicator
                />
                : shouldLoadPreviewImage &&
                  <div className="absolute inset-0 bg-dim" />}
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
            : shouldLoadPreviewImage
              ? <ImageMedium
                src={photo.url}
                aspectRatio={photo.aspectRatio}
                blurDataURL={photo.blurData}
                blurCompatibilityMode={doesMediaNeedBlurCompatibility(photo)}
                className="flex object-cover w-full h-full"
                classNameImage="object-cover w-full h-full"
                alt={altTextForMedia(photo)}
                priority={priority}
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'low'}
                showLoadingIndicator
              />
              : <div className="w-full h-full bg-black/5" />}
        </div>}
    </LinkWithStatus>
  );
};
