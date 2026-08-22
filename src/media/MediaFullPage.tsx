import { Media } from '.';
import { INFINITE_SCROLL_FULL_MULTIPLE } from './loading-policy';
import MediaListLarge from './MediaListLarge';
import MediaListLargeInfinite from './MediaListLargeInfinite';
import { SortBy } from './sort';

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
  return (
    <div className="space-y-1">
      <MediaListLarge
        photos={photos}
        animate={false}
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
