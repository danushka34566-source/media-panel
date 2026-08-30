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
import ImageSmall from '@/components/image/ImageSmall';
import ImageWithFallback from '@/components/image/ImageWithFallback';
import { IMAGE_WIDTH_SMALL } from '@/components/image';
import Link from 'next/link';
import { clsx } from 'clsx/lite';
import { pathForMedia } from '@/app/path';
import { useRef, useState } from 'react';
import useVisibility from '@/utility/useVisibility';
import { LuPlay } from 'react-icons/lu';
import useVideoPreviewLifecycle from './video-preview-lifecycle';
import useMediaPreload from './useMediaPreload';
import useVideoPreviewRecovery from './useVideoPreviewRecovery';

export default function MediaSmall({
  photo,
  selected,
  className,
  prefetch = false,
  onVisible,
  thumbnailAspectRatio,
  enableVideoPreview = true,
  ...categories
}: {
  photo: Media
  selected?: boolean
  className?: string
  prefetch?: boolean
  onVisible?: () => void
  thumbnailAspectRatio?: number
  enableVideoPreview?: boolean
} & MediaSetCategory) {
  const ref = useRef<HTMLAnchorElement>(null);

  useVisibility({ ref, onVisible });

  const isVideo = isVideoMedia(photo);
  const posterSrc = getMediaPosterUrl(photo);
  const previewSrc = getMediaPreviewUrl(photo);
  const [videoFailedMediaId, setVideoFailedMediaId] = useState<string>();
  const [posterFailedMediaId, setPosterFailedMediaId] = useState<string>();
  const aspectRatio = thumbnailAspectRatio ?? getMediaAspectRatio(photo);
  const hasVideoFailed = videoFailedMediaId === photo.id;
  const {
    isActive: isPreviewActive,
    isExiting: isPreviewExiting,
  } = useVideoPreviewLifecycle({
    ref,
    enabled: Boolean(
      isVideo &&
      enableVideoPreview &&
      previewSrc &&
      videoFailedMediaId !== photo.id,
    ),
    preloadUrl: previewSrc,
  });
  const shouldRenderPreview = isPreviewActive || isPreviewExiting;
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoRecovery = useVideoPreviewRecovery({
    videoRef,
    active: shouldRenderPreview && !hasVideoFailed,
    src: previewSrc,
    onFatalError: () => setVideoFailedMediaId(photo.id),
  });
  const { shouldLoad: shouldLoadMediaImage } = useMediaPreload({ ref });
  const hasPosterFailed = posterFailedMediaId === photo.id;
  const eagerMediaImage = shouldLoadMediaImage ? 'eager' : 'lazy';

  return (
    <Link
      ref={ref}
      href={pathForMedia({ photo, ...categories })}
      className={clsx(
        className,
        'active:brightness-75',
        selected && 'brightness-50',
        'min-w-[50px]',
        'rounded-[3px] overflow-hidden',
        'border-main',
      )}
      prefetch={prefetch}
    >
      {isVideo
        ? <div
          className={clsx(
            'relative',
            'bg-black flex items-center justify-center',
          )}
          style={{
            aspectRatio,
            width: IMAGE_WIDTH_SMALL,
          }}
        >
          {posterSrc && !hasPosterFailed
            ? <ImageWithFallback
              src={posterSrc}
              width={IMAGE_WIDTH_SMALL}
              height={Math.round(IMAGE_WIDTH_SMALL / aspectRatio)}
              alt={altTextForMedia(photo)}
              fallbackToUnoptimized
              className="absolute inset-0 w-full h-full"
              classNameImage="w-full h-full object-cover"
              loading={eagerMediaImage}
              fetchPriority="low"
              onError={() => setPosterFailedMediaId(photo.id)}
              showLoadingIndicator
            />
            : <div className="absolute inset-0 bg-black" />}
          {shouldRenderPreview && previewSrc && !hasVideoFailed &&
            <video
              ref={videoRef}
              src={previewSrc}
              poster={posterSrc}
              className={clsx(
                'absolute inset-0 w-full h-full object-cover',
              )}
              playsInline
              muted
              loop
              autoPlay
              disablePictureInPicture
              disableRemotePlayback
              preload="auto"
              onLoadedData={() => {
                videoRecovery.onLoadedData();
              }}
              onCanPlay={() => videoRecovery.onCanPlay()}
              onPlaying={() => videoRecovery.onPlaying()}
              onStalled={() => videoRecovery.onStalled()}
              onError={() => videoRecovery.onError()}
            />}
          <div className="absolute inset-0 bg-black/20" />
          <span className={clsx(
            'absolute inset-0 flex items-center justify-center',
            'text-white',
          )}>
            <LuPlay size={16} className="drop-shadow" />
          </span>
        </div>
        : thumbnailAspectRatio
          ? <div
            className="overflow-hidden bg-black"
            style={{
              aspectRatio,
              width: IMAGE_WIDTH_SMALL,
            }}
          >
            <ImageWithFallback
              src={photo.url}
              width={IMAGE_WIDTH_SMALL}
              height={Math.round(IMAGE_WIDTH_SMALL / aspectRatio)}
              blurDataURL={photo.blurData}
              blurCompatibilityLevel={
                doesMediaNeedBlurCompatibility(photo) ? 'high' : 'none'
              }
              className="w-full h-full"
              classNameImage="object-cover w-full h-full"
              alt={altTextForMedia(photo)}
              loading={eagerMediaImage}
              fetchPriority="low"
              showLoadingIndicator
            />
          </div>
          : <ImageSmall
            src={photo.url}
            aspectRatio={photo.aspectRatio}
            blurDataURL={photo.blurData}
            blurCompatibilityMode={doesMediaNeedBlurCompatibility(photo)}
            alt={altTextForMedia(photo)}
            loading={eagerMediaImage}
            fetchPriority="low"
            showLoadingIndicator
          />
      }
    </Link>
  );
};
