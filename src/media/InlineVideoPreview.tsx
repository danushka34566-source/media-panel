'use client';

import { clsx } from 'clsx/lite';
import { useEffect, useRef, useState } from 'react';
import useVideoPreviewRecovery from './useVideoPreviewRecovery';
import { releaseVideoElement } from './release-video-element';

export default function InlineVideoPreview({
  src,
  active,
  onError,
  onPrepared,
}: {
  src: string
  active: boolean
  onError: () => void
  onPrepared?: () => void
}) {
  const [isReady, setIsReady] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const recovery = useVideoPreviewRecovery({
    videoRef: ref,
    active,
    src,
    onFatalError: onError,
  });
  useEffect(() => {
    const video = ref.current;
    return () => releaseVideoElement(video);
  }, []);
  return <video
    ref={ref}
    className={clsx(
      'absolute inset-0 w-full h-full object-cover',
      'transition-opacity duration-150',
      isReady ? 'opacity-100' : 'opacity-0',
    )}
    playsInline
    muted
    loop
    autoPlay={active}
    disablePictureInPicture
    disableRemotePlayback
    preload="auto"
    src={src}
    onLoadStart={() => setIsReady(false)}
    onLoadedData={() => {
      setIsReady(true);
      onPrepared?.();
      recovery.onLoadedData();
    }}
    onCanPlay={() => {
      setIsReady(true);
      recovery.onCanPlay();
    }}
    onPlaying={() => {
      setIsReady(true);
      recovery.onPlaying();
    }}
    // Once a frame has decoded, leave it painted while the next segment
    // buffers. Making the video transparent here exposed a blank poster and
    // looked as if a still-playing preview had disappeared.
    onWaiting={() => undefined}
    onStalled={() => {
      recovery.onStalled();
    }}
    onError={() => {
      setIsReady(false);
      recovery.onError();
    }}
  />;
}
