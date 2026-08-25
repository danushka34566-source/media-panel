import AppGrid from './AppGrid';
import { clsx } from 'clsx/lite';
import { Skeleton, SkeletonLine } from './Skeleton';
import { GRID_ASPECT_RATIO } from '@/app/config';
import { GRID_GAP_CLASSNAME } from '.';

const GRID_CARD_COUNT = 24;

function SkeletonMediaCard({ wide = false }: { wide?: boolean }) {
  return <div
    className="relative min-w-0 overflow-hidden rounded-[3px]"
    style={{
      ...(wide ? { aspectRatio: 16 / 9 } : GRID_ASPECT_RATIO !== 0
        ? { aspectRatio: GRID_ASPECT_RATIO }
        : {}),
      contentVisibility: 'auto',
      containIntrinsicSize: '240px',
    }}
  >
    <Skeleton className="absolute inset-0 rounded-none" />
  </div>;
}

export function MediaGridSkeleton({
  withSidebar = true,
  wide = false,
}: {
  withSidebar?: boolean
  wide?: boolean
}) {
  const grid = <div
    className={clsx(
      'grid grid-flow-row-dense items-center',
      GRID_GAP_CLASSNAME,
      wide
        ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
        : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4',
    )}
    aria-hidden="true"
  >
    {Array.from({ length: GRID_CARD_COUNT }, (_, index) =>
      <SkeletonMediaCard key={index} wide={wide} />,
    )}
  </div>;

  return <AppGrid
    contentMain={<div className="space-y-5" aria-busy="true">{grid}</div>}
    contentSide={withSidebar
      ? <div className="hidden space-y-3 md:block" aria-hidden="true">
        <Skeleton className="h-7 w-32" />
        {Array.from({ length: 9 }, (_, index) =>
          <div key={index} className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <SkeletonLine className="w-28" />
          </div>,
        )}
      </div>
      : undefined}
  />;
}

export function MediaFullSkeleton() {
  return <div
    className="space-y-1"
    aria-busy="true"
    aria-hidden="true"
  >
    {Array.from({ length: 5 }, (_, index) =>
      <div key={index} className="space-y-2">
        <Skeleton className="w-full aspect-video" />
        <div className="flex justify-between gap-3">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-20" />
        </div>
      </div>,
    )}
  </div>;
}

export function MediaDetailSkeleton() {
  return <div className="space-y-5" aria-busy="true" aria-hidden="true">
    <AppGrid contentMain={
      <div className="space-y-2">
        <SkeletonLine className="h-5 w-2/3" />
        <SkeletonLine className="h-3 w-1/3" />
      </div>
    } />
    <div className="space-y-4">
      <Skeleton className="w-full aspect-video" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
    <AppGrid contentMain={
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) =>
          <SkeletonMediaCard key={index} />,
        )}
      </div>
    } />
  </div>;
}

export function AdminNavSkeleton() {
  return <div className="flex flex-wrap items-center gap-2" aria-busy="true">
    <Skeleton className="h-9 w-24" />
    <Skeleton className="h-9 w-28" />
    <Skeleton className="h-9 w-20" />
    <Skeleton className="h-9 w-24" />
    <Skeleton className="h-9 w-16" />
  </div>;
}

export function AdminPageSkeleton() {
  return <div className="mt-4" aria-busy="true">
    <AppGrid contentMain={
      <div className="space-y-4">
        {Array.from({ length: 8 }, (_, index) =>
          <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
            <Skeleton className="h-16 w-24 sm:h-20 sm:w-32" />
            <div className="min-w-0 space-y-2">
              <SkeletonLine className="w-3/4" />
              <SkeletonLine className="w-1/2" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>,
        )}
      </div>
    } />
  </div>;
}
