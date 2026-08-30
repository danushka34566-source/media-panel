'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import AppGrid from '@/components/AppGrid';
import { getMediaPreviewUrl, Media } from '.';
import MediaGrid from './MediaGrid';
import { MediaSetCategory } from '../category';
import { MediaGridSkeleton } from '@/components/PageSkeletons';
import {
  isDetailPreviewStartupComplete,
  subscribeDetailPreviewStartup,
} from './detail-preview-startup';

export default function MediaDetailRelated({
  photos,
  selectedMedia,
  ...categories
}: {
  photos: Media[]
  selectedMedia?: Media
} & MediaSetCategory) {
  const [isReady, setIsReady] = useState(false);
  const waitsForMainPreview = Boolean(
    selectedMedia && getMediaPreviewUrl(selectedMedia),
  );
  const isMainPreviewPrepared = useSyncExternalStore(
    onStoreChange => subscribeDetailPreviewStartup(onStoreChange),
    () => Boolean(
      selectedMedia &&
      isDetailPreviewStartupComplete(selectedMedia.id),
    ),
    () => false,
  );
  const canStartRelatedPreviews = !waitsForMainPreview ||
    isMainPreviewPrepared;

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
    // The hero is the only priority image. Related posters stay mounted but
    // use normal native loading order; no small card competes with the main
    // poster or main preview for an eager/high-priority request.
    autoplaySmartPreviews
    suspendSmartPreviewsOnMainPlayback
    // Posters are mounted and prepared ahead of the viewport, while video
    // decoders are reserved for cards that are actually visible. This keeps
    // the main player responsive without delaying the related image grid.
    mountPreviewsOnlyWhenVisible
    prefetchInitialMediaLinks={false}
    sequenceVideoPreviewStartup
    enableVideoPreviews={canStartRelatedPreviews}
    animateOnFirstLoadOnly
  />} />;
}
