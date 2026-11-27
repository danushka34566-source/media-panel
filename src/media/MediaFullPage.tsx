'use client';

import { Media } from '.';
import {
  INFINITE_SCROLL_FULL_INITIAL,
  INFINITE_SCROLL_FULL_MULTIPLE,
} from './loading-policy';
import MediaListLarge from './MediaListLarge';
import MediaListLargeInfinite from './MediaListLargeInfinite';
import { SortBy } from './sort';
import useMediaScrollRestoration from './useMediaScrollRestoration';
import { PATH_FULL_INFERRED } from '@/app/path';

export default function MediaFullPage({
  photos,
  photosCount,
  initialHasMore,
  sortBy,
  sortWithPriority,
}:{
  photos: Media[]
  photosCount: number
  initialHasMore?: boolean
  sortBy: SortBy
  sortWithPriority: boolean
}) {
  const restoredEntry = useMediaScrollRestoration(
    `page-${PATH_FULL_INFERRED}`,
    false,
    initialHasMore === undefined
      ? photosCount <= photos.length
      : !initialHasMore,
  );

  // The initial SQL batch can yield fewer cards after parsing and deduplication.
  const initialOffset = INFINITE_SCROLL_FULL_INITIAL;

  return (
    <div className="space-y-1">
      <MediaListLarge
        photos={photos}
        animate={!restoredEntry}
      />
      {(initialHasMore ?? photosCount > photos.length) &&
        <MediaListLargeInfinite
          initialOffset={initialOffset}
          itemsPerPage={INFINITE_SCROLL_FULL_MULTIPLE}
          sortBy={sortBy}
          sortWithPriority={sortWithPriority}
          excludeFromFeeds
        />}
    </div>
  );
}
