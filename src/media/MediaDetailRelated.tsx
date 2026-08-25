'use client';

import { useEffect, useState } from 'react';
import AppGrid from '@/components/AppGrid';
import { Media } from '.';
import MediaGrid from './MediaGrid';
import { MediaSetCategory } from '../category';
import { MediaGridSkeleton } from '@/components/PageSkeletons';

export default function MediaDetailRelated({
  photos,
  selectedMedia,
  ...categories
}: {
  photos: Media[]
  selectedMedia?: Media
} & MediaSetCategory) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const requestIdle = (window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number
      cancelIdleCallback?: (handle: number) => void
    }).requestIdleCallback;
    const cancelIdle = (window as Window & {
      cancelIdleCallback?: (handle: number) => void
    }).cancelIdleCallback;
    const schedule = requestIdle ?? ((callback: IdleRequestCallback) =>
      window.setTimeout(() => callback({
        didTimeout: false,
        timeRemaining: () => 0,
      } as IdleDeadline), 0));
    const cancel = cancelIdle ?? window.clearTimeout;
    const handle = schedule(() => setIsReady(true));
    return () => cancel(handle);
  }, []);

  if (!isReady) {
    return <MediaGridSkeleton withSidebar={false} />;
  }

  return <AppGrid contentMain={<MediaGrid
    photos={photos}
    selectedMedia={selectedMedia}
    {...categories}
    autoplaySmartPreviews
    suspendSmartPreviewsOnMainPlayback
    mountPreviewsOnlyWhenVisible
    animateOnFirstLoadOnly
  />} />;
}
