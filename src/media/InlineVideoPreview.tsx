'use client';

import { clsx } from 'clsx/lite';
import { useRef, useState } from 'react';
import useVideoPreviewRecovery from './useVideoPreviewRecovery';

export default function InlineVideoPreview({
  src,
  active,
  onError,
}: {
  src: string
  active: boolean
  onError: () => void
}) {
  const [isReady, setIsReady] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const recovery = useVideoPreviewRecovery({
    videoRef: ref,
    active,
    src,
    onFatalError: onError,
  });
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
      recovery.onLoadedData();
    }}
    onCanPlay={() => recovery.onCanPlay()}
    onPlaying={() => {
      setIsReady(true);
      recovery.onPlaying();
    }}
    onWaiting={() => setIsReady(false)}
    onStalled={() => {
      setIsReady(false);
      recovery.onStalled();
    }}
    onError={() => {
      setIsReady(false);
      recovery.onError();
    }}
  />;
}
