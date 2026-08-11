'use client';

import { INFINITE_SCROLL_GRID_MULTIPLE } from '.';
import InfiniteMediaScroll from './InfiniteMediaScroll';
import MediaGrid from './MediaGrid';
import { ComponentProps } from 'react';
import { SortBy } from './sort';

export default function MediaGridInfinite({
  cacheKey,
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
      sortBy={sortBy}
      sortWithPriority={sortWithPriority}
      excludeFromFeeds={excludeFromFeeds}
      query={query}
      {...categories}
    >
      {({ key, photos, onLastMediaVisible }) =>
        <MediaGrid key={key} {...{
          photos,
          ...categories,
          canStart,
          onLastMediaVisible,
          animateOnFirstLoadOnly,
        }} />}
    </InfiniteMediaScroll>
  );
}
