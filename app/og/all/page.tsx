import {
  INFINITE_SCROLL_GRID_INITIAL,
  INFINITE_SCROLL_GRID_MULTIPLE,
} from '@/media';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import StaggeredOgMedia from '@/media/StaggeredOgMedia';
import StaggeredOgMediaInfinite from '@/media/StaggeredOgMediaInfinite';

export default async function OGPage() {
  const [
    photos,
    count,
  ] = await Promise.all([
    getMediaCached({ limit: INFINITE_SCROLL_GRID_INITIAL })
      .catch(() => []),
    getMediaMetaCached()
      .then(({ count }) => count)
      .catch(() => 0),
  ]);
  
  return (
    <>
      <StaggeredOgMedia {...{ photos }} />
      {count > photos.length &&
        <div className="mt-3">
          <StaggeredOgMediaInfinite
            initialOffset={photos.length}
            itemsPerPage={INFINITE_SCROLL_GRID_MULTIPLE}
          />
        </div>}
    </>
  );
}
