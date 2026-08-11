'use client';

import { ComponentProps, useRef, useState } from 'react';
import { clsx } from 'clsx/lite';
import Link from 'next/link';
import useVisibility from '@/utility/useVisibility';
import OGLoaderImage from './OGLoaderImage';
import { IMAGE_OG_DIMENSION } from '@/image-response';
import useVideoPreviewLifecycle from '@/media/video-preview-lifecycle';

export type OGTilePropsCore = Omit<
  ComponentProps<typeof OGTile>,
  'title' | 'description' | 'path' | 'pathImage'
>;

export default function OGTile({
  path,
  pathImage,
  description,
  riseOnHover,
  onVisible,
  videoSrc,
  poster,
  ...props
}: {
  description: string
  pathImage: string
  riseOnHover?: boolean
  onVisible?: () => void
  videoSrc?: string
  poster?: string
} & ComponentProps<typeof OGLoaderImage>) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [readyVideoSrc, setReadyVideoSrc] = useState<string>();
  const [failedVideoSrc, setFailedVideoSrc] = useState<string>();
  const isPreviewActive = useVideoPreviewLifecycle({
    ref,
    enabled: Boolean(videoSrc && failedVideoSrc !== videoSrc),
  });
  const isVideoReady = readyVideoSrc === videoSrc;
  const hasVideoFailed = failedVideoSrc === videoSrc;

  useVisibility({ ref, onVisible });

  return (
    <Link
      ref={ref}
      href={path}
      className={clsx(
        'group',
        'block w-full rounded-md overflow-hidden',
        'border-medium shadow-xs',
        riseOnHover && 'hover:-translate-y-1.5 transition-transform',
      )}
    >
      {videoSrc || poster
        ? (
          <div
            className={clsx('relative w-full overflow-hidden bg-black')}
            style={{ aspectRatio: IMAGE_OG_DIMENSION.aspectRatio }}
          >
            {poster
              ? <img
                src={poster}
                alt=""
                className="absolute inset-0 size-full object-cover"
                loading="lazy"
              />
              : <OGLoaderImage {...{ ...props, path: pathImage }} />}
            {isPreviewActive && !hasVideoFailed && <>
              <video
                src={videoSrc}
                poster={poster}
                className={clsx(
                  'absolute inset-0 w-full h-full object-cover',
                  'transition-opacity duration-200',
                  isVideoReady ? 'opacity-100' : 'opacity-0',
                )}
                muted
                autoPlay
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                controlsList="nodownload noplaybackrate"
                onContextMenu={(e) => e.preventDefault()}
                onLoadedData={() => setReadyVideoSrc(videoSrc)}
                onError={() => setFailedVideoSrc(videoSrc)}
              />
            </>}
          </div>
        )
        : <OGLoaderImage {...{ ...props, path: pathImage }} />}
      <div className={clsx(
        'h-full flex flex-col gap-0.5 p-3',
        'font-sans leading-tight',
        'bg-gray-50 dark:bg-gray-900/50',
        'group-active:bg-gray-50 dark:group-active:bg-gray-900/50',
        'group-hover:bg-gray-100 dark:group-hover:bg-gray-900/70',
        'border-t border-gray-200 dark:border-gray-800',
      )}>
        <div className="text-gray-800 dark:text-white font-medium">
          {props.title}
        </div>
        <div className="text-medium">
          {description}
        </div>
      </div>
    </Link>
  );
};
