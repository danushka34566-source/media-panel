'use client';

import { PATH_OG } from '@/app/path';
import InfiniteMediaScroll from './InfiniteMediaScroll';
import StaggeredOgMedia from './StaggeredOgMedia';

export default function StaggeredOgMediaInfinite({
  initialOffset,
  itemsPerPage,
}: {
  initialOffset: number
  itemsPerPage: number
}) {
  return (
    <InfiniteMediaScroll
      cacheKey={`page-${PATH_OG}`}
      initialOffset={initialOffset}
      itemsPerPage={itemsPerPage}
    >
      {({ key, photos, onLastMediaVisible }) =>
        <StaggeredOgMedia
          key={key}
          photos={photos}
          onLastMediaVisible={onLastMediaVisible}
        />}
    </InfiniteMediaScroll>
  );
}
