'use client';

import { PATH_FULL_INFERRED } from '@/app/path';
import { FULL_LIST_LOAD_AHEAD_VIEWPORTS } from './loading-policy';
import InfiniteMediaScroll from './InfiniteMediaScroll';
import MediaListLarge from './MediaListLarge';
import { SortBy } from './sort';

export default function MediaListLargeInfinite({
  initialOffset,
  itemsPerPage,
  sortBy,
  excludeFromFeeds,
}: {
  initialOffset: number
  itemsPerPage: number
  sortBy: SortBy
  sortWithPriority: boolean
  excludeFromFeeds?: boolean
}) {
  return (
    <InfiniteMediaScroll
      cacheKey={`page-${PATH_FULL_INFERRED}`}
      initialOffset={initialOffset}
      itemsPerPage={itemsPerPage}
      sortBy={sortBy}
      excludeFromFeeds={excludeFromFeeds}
      wrapMoreButtonInGrid
      loadAheadViewports={FULL_LIST_LOAD_AHEAD_VIEWPORTS}
    >
      {({ key, photos, onLastMediaVisible, revalidateMedia }) =>
        <MediaListLarge
          key={key}
          photos={photos}
          onLastMediaVisible={onLastMediaVisible}
          revalidateMedia={revalidateMedia}
        />}
    </InfiniteMediaScroll>
  );
}
