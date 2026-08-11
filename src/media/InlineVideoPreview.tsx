'use client';

import { clsx } from 'clsx/lite';
import { useEffect, useRef, useState } from 'react';

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
  useEffect(() => {
    const video = ref.current;
    if (!video) { return; }
    const playIfActive = () => {
      if (!active || document.hidden) { return; }
      void video.play().catch(() => setIsReady(false));
    };
    const onVisibilityChange = () => playIfActive();
    if (active) { playIfActive(); } else {
      video.pause();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('resume', playIfActive);
    window.addEventListener('pageshow', playIfActive);
    window.addEventListener('focus', playIfActive);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('resume', playIfActive);
      window.removeEventListener('pageshow', playIfActive);
      window.removeEventListener('focus', playIfActive);
    };
  }, [active]);
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
    onLoadedData={() => setIsReady(true)}
    onCanPlay={event => {
      if (active) {
        void event.currentTarget.play().catch(() => setIsReady(false));
      }
    }}
    onPlaying={() => setIsReady(true)}
    onWaiting={() => setIsReady(false)}
    onStalled={() => setIsReady(false)}
    onError={onError}
  />;
}
