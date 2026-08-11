'use client';

import AppGrid from '@/components/AppGrid';
import MediaGrid from './MediaGrid';
import MediaGridInfinite from './MediaGridInfinite';
import { clsx } from 'clsx/lite';
import AnimateItems from '@/components/AnimateItems';
import { ComponentProps, useCallback, useState, ReactNode } from 'react';
import { GRID_SPACE_CLASSNAME } from '@/components';
import { SortBy } from './sort';

export default function MediaGridContainer({
  cacheKey,
  photos,
  count,
  sortBy,
  sortWithPriority,
  excludeFromFeeds,
  query,
  animateOnFirstLoadOnly,
  header,
  sidebar,
  className,
  ...categories
}: {
  cacheKey: string
  count: number
  sortBy?: SortBy
  sortWithPriority?: boolean
  excludeFromFeeds?: boolean
  query?: string
  header?: ReactNode
  sidebar?: ReactNode
  className?: string
} & ComponentProps<typeof MediaGrid>) {
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
            items={[header]}
            animateOnFirstLoadOnly
          />}
        <div className={GRID_SPACE_CLASSNAME}>
          <MediaGrid {...{
            photos,
            ...categories,
            animateOnFirstLoadOnly,
            onAnimationComplete,
          }} />
          {count > photos.length &&
            <MediaGridInfinite {...{
              cacheKey,
              initialOffset: photos.length,
              sortBy,
              sortWithPriority,
              excludeFromFeeds,
              query,
              ...categories,
              canStart: shouldAnimateDynamicItems,
              animateOnFirstLoadOnly,
            }} />}
        </div>
      </div>}
      contentSide={sidebar}
    />
  );
}
