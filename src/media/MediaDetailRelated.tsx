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
    // Let the detail hero's initial high-priority poster/preview request reach
    // the browser first. Start related cards on the next frame rather than
    // waiting for idle time, so their images and previews load in parallel.
    const startRelated = () => setIsReady(true);
    if (typeof window.requestAnimationFrame === 'function') {
      const frame = window.requestAnimationFrame(startRelated);
      return () => window.cancelAnimationFrame(frame);
    }
    const timeout = window.setTimeout(startRelated, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!isReady) {
    return <MediaGridSkeleton withSidebar={false} />;
  }

  return <AppGrid contentMain={<MediaGrid
    photos={photos}
    selectedMedia={selectedMedia}
    {...categories}
    // Related cards start immediately after the hero commit. Their requests
    // stay normal priority while the hero poster remains the high-priority asset.
    prioritizeInitialMedia
    autoplaySmartPreviews
    suspendSmartPreviewsOnMainPlayback
    mountPreviewsOnlyWhenVisible={false}
    animateOnFirstLoadOnly
  />} />;
}
