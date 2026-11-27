'use client';

import AppGrid from '@/components/AppGrid';
import MediaGrid from './MediaGrid';
import MediaGridInfinite from './MediaGridInfinite';
import { clsx } from 'clsx/lite';
import AnimateItems from '@/components/AnimateItems';
import {
  ComponentProps,
  Fragment,
  useCallback,
  useState,
  ReactNode,
} from 'react';
import { GRID_SPACE_CLASSNAME } from '@/components';
import { SortBy } from './sort';
import useMediaScrollRestoration from './useMediaScrollRestoration';

export default function MediaGridContainer({
  cacheKey,
  photos,
  count,
  initialHasMore,
  sortBy,
  sortWithPriority,
  excludeFromFeeds,
  query,
  header,
  sidebar,
  className,
  ...categories
}: {
  cacheKey: string
  count: number
  initialHasMore?: boolean
  sortBy?: SortBy
  sortWithPriority?: boolean
  excludeFromFeeds?: boolean
  query?: string
  header?: ReactNode
  sidebar?: ReactNode
  className?: string
} & ComponentProps<typeof MediaGrid>) {
  const hasMore = initialHasMore ?? count > photos.length;
  const restoredEntry = useMediaScrollRestoration(
    cacheKey,
    false,
    !hasMore,
    query,
  );
  const shouldAnimate = !restoredEntry && categories.animate !== false;
  const [
    shouldAnimateDynamicItems,
    setShouldAnimateDynamicItems,
  ] = useState(false);
  const onAnimationComplete = useCallback(() =>
    setShouldAnimateDynamicItems(true), []);

  return (
    <AppGrid
      contentMain={<div className={clsx(
        header && 'space-y-8 mt-1.5',
        className,
      )}>
        {header &&
          <AnimateItems
            type="bottom"
            items={[<Fragment key="header">{header}</Fragment>]}
            animateOnFirstLoadOnly
          />}
        <div className={GRID_SPACE_CLASSNAME}>
          {hasMore
            ?
            <MediaGridInfinite key={cacheKey} {...{
              cacheKey,
              initialPhotos: photos,
              initialOffset: photos.length,
              sortBy,
              sortWithPriority,
              excludeFromFeeds,
              query,
              ...categories,
              animate: shouldAnimate,
              canStart: shouldAnimateDynamicItems,
              onAnimationComplete,
            }} />
            : <MediaGrid {...{
              photos,
              sortBy,
              query,
              ...categories,
              animate: shouldAnimate,
              onAnimationComplete,
            }} />}
        </div>
      </div>}
      contentSide={sidebar}
    />
  );
}
