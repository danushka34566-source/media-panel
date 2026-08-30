'use client';

import { Media } from '.';
import { PATH_GRID_INFERRED } from '@/app/path';
import MediaGridSidebar from './MediaGridSidebar';
import MediaGridContainer from './MediaGridContainer';
import { ComponentProps, useMemo, useRef } from 'react';
import clsx from 'clsx/lite';
import MaskedScroll from '@/components/MaskedScroll';
import { IS_RECENTS_FIRST, SHOW_CATEGORIES_ON_MOBILE } from '@/app/config';
import { SortBy } from './sort';
import useViewportHeight from '@/utility/useViewportHeight';
import TopMediaEntities from './TopMediaEntities';
import AnimateItems from '@/components/AnimateItems';
import { hasEnoughTopEntities } from '@/category/mobile';

export default function MediaGridPageClient({
  photos,
  photosCount,
  photosCountWithExcludes,
  sortBy,
  sortWithPriority,
  ...categories
}: ComponentProps<typeof MediaGridSidebar> & {
  photos: Media[]
  photosCount: number
  photosCountWithExcludes: number
  sortBy: SortBy
  sortWithPriority: boolean
}) {
  const ref = useRef<HTMLDivElement>(null);

  const viewPortHeight = useViewportHeight();
  const containerHeight = useMemo(() =>
    viewPortHeight - (ref.current?.getBoundingClientRect().y ?? 0),
  [viewPortHeight]);

  const shouldShowTopEntities = useMemo(() =>
    SHOW_CATEGORIES_ON_MOBILE && hasEnoughTopEntities(categories),
  [categories]);

  return (
    <div>
      {shouldShowTopEntities &&
        <AnimateItems
          type="bottom"
          items={[
            <div key="mobile-sidebar" className={clsx(
              'flex gap-x-2',
              'md:hidden',
              'mb-4',
            )}>
              <TopMediaEntities
                className="grow"
                {...categories}
              />
            </div>,
          ]} />}
      <MediaGridContainer
        cacheKey={`page-${PATH_GRID_INFERRED}`}
        photos={photos}
        count={photosCount}
        sortBy={sortBy}
        sortWithPriority={sortWithPriority}
        excludeFromFeeds
        prioritizeInitialMedia
        // The initial visit keeps the existing entrance motion. Returning
        // from a detail route must paint the restored deep row immediately,
        // rather than replaying motion across a long cached grid.
        animateOnFirstLoadOnly
        sidebar={
          <MaskedScroll
            ref={ref}
            className={clsx(
              'sticky top-0',
              // Optical adjustment for headerless recents
              IS_RECENTS_FIRST ? '-mb-4.5 -mt-4.5' : '-mb-5 -mt-5',
              'max-h-screen py-4',
            )}
            fadeSize={100}
            setMaxSize={false}
          >
            <MediaGridSidebar {...{
              ...categories,
              photosCount: photosCountWithExcludes,
              containerHeight,
            }} />
          </MaskedScroll>
        }
      />
    </div>
  );
}
