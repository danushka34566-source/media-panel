'use client';

import { Media } from '.';
import { INFINITE_SCROLL_FULL_MULTIPLE } from './loading-policy';
import MediaListLarge from './MediaListLarge';
import MediaListLargeInfinite from './MediaListLargeInfinite';
import { SortBy } from './sort';
import useMediaScrollRestoration from './useMediaScrollRestoration';

export default function MediaFullPage({
  photos,
  photosCount,
  sortBy,
  sortWithPriority,
}:{
  photos: Media[]
  photosCount: number
  sortBy: SortBy
  sortWithPriority: boolean
}) {
  useMediaScrollRestoration();

  return (
    <div className="space-y-1">
      <MediaListLarge
        photos={photos}
        optimizeLongList
      />
      {photosCount > photos.length &&
        <MediaListLargeInfinite
          initialOffset={photos.length}
          itemsPerPage={INFINITE_SCROLL_FULL_MULTIPLE}
          sortBy={sortBy}
          sortWithPriority={sortWithPriority}
          excludeFromFeeds
        />}
    </div>
  );
}
