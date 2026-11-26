'use client';

import { useSyncExternalStore } from 'react';
import AppGrid from '@/components/AppGrid';
import { getDisplayTranscodeStatus, getMediaPreviewUrl, Media } from '.';
import MediaGrid from './MediaGrid';
import { MediaSetCategory } from '../category';
import type { SortBy } from './sort';
import {
  isDetailPreviewStartupComplete,
  subscribeDetailPreviewStartup,
} from './detail-preview-startup';

export default function MediaDetailRelated({
  photos,
  selectedMedia,
  sortBy,
  ...categories
}: {
  photos: Media[]
  selectedMedia?: Media
  sortBy?: SortBy
} & MediaSetCategory) {
  const waitsForMainPreview = Boolean(
    selectedMedia &&
    !getDisplayTranscodeStatus(selectedMedia) &&
    getMediaPreviewUrl(selectedMedia),
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

  return <AppGrid contentMain={<MediaGrid
    photos={photos}
    selectedMedia={selectedMedia}
    sortBy={sortBy}
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
