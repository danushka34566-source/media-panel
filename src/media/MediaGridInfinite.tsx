'use client';

import { INFINITE_SCROLL_GRID_MULTIPLE, Media } from '.';
import InfiniteMediaScroll from './InfiniteMediaScroll';
import MediaGrid from './MediaGrid';
import { ComponentProps } from 'react';
import { SortBy } from './sort';

const combineUniqueMedia = (initial: Media[], loaded: Media[]) => {
  const seenIds = new Set<string>();
  return [...initial, ...loaded].filter(photo => {
    if (seenIds.has(photo.id)) { return false; }
    seenIds.add(photo.id);
    return true;
  });
};

export default function MediaGridInfinite({
  cacheKey,
  initialPhotos,
  initialOffset,
  sortBy,
  sortWithPriority,
  excludeFromFeeds,
  query,
  canStart,
  animateOnFirstLoadOnly,
  ...categories
}: {
  cacheKey: string
  initialPhotos?: Media[]
  initialOffset: number
  sortBy?: SortBy
  sortWithPriority?: boolean
  excludeFromFeeds?: boolean
  query?: string
} & Omit<ComponentProps<typeof MediaGrid>, 'photos'>) {
  return (
    <InfiniteMediaScroll
      cacheKey={cacheKey}
      initialOffset={initialOffset}
      itemsPerPage={INFINITE_SCROLL_GRID_MULTIPLE}
      coalescePages
      sortBy={sortBy}
      sortWithPriority={sortWithPriority}
      excludeFromFeeds={excludeFromFeeds}
      query={query}
      // Fetch the next grid page well before the current page reaches the
      // viewport end, giving its cards and images time to mount and decode.
      loadAheadViewports={3}
      {...categories}
    >
      {({ key, photos, onLastMediaVisible }) =>
        <MediaGrid key={key} {...{
          photos: combineUniqueMedia(initialPhotos ?? [], photos),
          ...categories,
          canStart,
          onLastMediaVisible,
          animateOnFirstLoadOnly,
        }} />}
    </InfiniteMediaScroll>
  );
}
