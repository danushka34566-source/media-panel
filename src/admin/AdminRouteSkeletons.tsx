import AppGrid from '@/components/AppGrid';
import { clsx } from 'clsx/lite';
import { Skeleton, SkeletonLine } from '@/components/Skeleton';

const rowWidths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3', 'w-3/5'];

function ActionsSkeleton({ count = 2 }: { count?: number }) {
  return <div className="flex shrink-0 items-center gap-2">
    {Array.from({ length: count }, (_, index) =>
      <Skeleton key={index} className="size-8 rounded-md" />,
    )}
  </div>;
}

function EntityTableSkeleton({
  rows = 8,
  variant = 'entity',
}: {
  rows?: number
  variant?: 'entity' | 'media' | 'user' | 'processing'
}) {
  return <div
    className="min-w-[14rem] overflow-hidden py-[1px]"
    aria-busy="true"
    aria-hidden="true"
  >
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
      {Array.from({ length: rows }, (_, index) =>
        variant === 'media'
          ? <div key={index} className="contents">
            <Skeleton className="h-12 w-20 rounded-[3px] sm:h-14 sm:w-24" />
            <div className="min-w-0 space-y-2">
              <SkeletonLine className={rowWidths[index % rowWidths.length]} />
              <SkeletonLine className="w-2/5" />
              <div className="hidden gap-2 sm:flex">
                <SkeletonLine className="w-24" />
                <SkeletonLine className="w-16" />
              </div>
            </div>
            <ActionsSkeleton count={3} />
          </div>
          : variant === 'user'
            ? <div key={index} className="contents">
              <Skeleton className="size-9 rounded-full" />
              <div className="min-w-0 space-y-2">
                <SkeletonLine className={rowWidths[index % rowWidths.length]} />
                <SkeletonLine className="w-2/3" />
              </div>
              <ActionsSkeleton count={2} />
            </div>
            : <div key={index} className="contents">
              {variant === 'processing'
                ? <Skeleton className="h-9 w-12 rounded-[3px] sm:h-11 sm:w-16" />
                : <div className="col-span-2 min-w-0 py-1">
                  <SkeletonLine className={rowWidths[index % rowWidths.length]} />
                </div>}
              {variant === 'processing' &&
                <div className="min-w-0 space-y-2">
                  <SkeletonLine className="w-4/5" />
                  <SkeletonLine className="w-2/5" />
                </div>}
              <ActionsSkeleton count={variant === 'processing' ? 3 : 2} />
            </div>,
      )}
    </div>
  </div>;
}

function TablePageSkeleton({
  rows,
  variant = 'entity',
  className,
}: {
  rows: number
  variant?: 'entity' | 'media' | 'user'
  className?: string
}) {
  return <AppGrid
    contentMain={<div
      className={clsx('space-y-6', className)}
      aria-busy="true"
    >
      <div className="space-y-3">
        <EntityTableSkeleton rows={rows} variant={variant} />
      </div>
    </div>}
  />;
}

export function AdminAlbumsSkeleton() {
  return <TablePageSkeleton rows={7} />;
}

export function AdminCategoriesSkeleton() {
  return <TablePageSkeleton rows={9} />;
}

export function AdminContentTypesSkeleton() {
  return <TablePageSkeleton rows={6} />;
}

export function AdminPerformersSkeleton() {
  return <TablePageSkeleton rows={10} />;
}

export function AdminRecipesSkeleton() {
  return <TablePageSkeleton rows={8} />;
}

export function AdminStudiosSkeleton() {
  return <TablePageSkeleton rows={8} />;
}

export function AdminTagsSkeleton() {
  return <TablePageSkeleton rows={12} />;
}

export function AdminMediaSkeleton() {
  return <AppGrid contentMain={<div className="space-y-4" aria-busy="true">
    <EntityTableSkeleton rows={15} variant="media" />
    <div className="flex justify-center gap-2 pt-2">
      <Skeleton className="h-8 w-8 rounded-md" />
      <Skeleton className="h-8 w-24 rounded-md" />
      <Skeleton className="h-8 w-8 rounded-md" />
    </div>
  </div>} />;
}

export function AdminMediaUpdatesSkeleton() {
  return <AppGrid contentMain={<div className="space-y-4" aria-busy="true">
    <EntityTableSkeleton rows={12} variant="media" />
  </div>} />;
}

export function AdminProcessingSkeleton() {
  return <AppGrid contentMain={<div className="space-y-8" aria-busy="true">
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SkeletonLine className="w-24" />
      </div>
      <EntityTableSkeleton rows={6} variant="processing" />
      <div className="flex justify-center"><Skeleton className="h-8 w-32 rounded-md" /></div>
    </section>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SkeletonLine className="w-24" />
      </div>
      <EntityTableSkeleton rows={6} variant="processing" />
      <div className="flex justify-center"><Skeleton className="h-8 w-32 rounded-md" /></div>
    </section>
  </div>} />;
}

export function AdminUploadsSkeleton() {
  return <AppGrid contentMain={<div className="space-y-4" aria-busy="true">
    <div className="space-y-2">
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) =>
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-12 w-20 rounded-[3px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonLine className="w-3/4" />
            <SkeletonLine className="w-1/2" />
          </div>
          <ActionsSkeleton count={2} />
        </div>,
      )}
    </div>
  </div>} />;
}

export function AdminUsersSkeleton() {
  return <TablePageSkeleton rows={10} variant="user" />;
}

export function AdminInsightsSkeleton() {
  return <AppGrid contentMain={<div
    className="max-w-xl w-full space-y-4 md:space-y-6"
    aria-busy="true"
  >
    {Array.from({ length: 6 }, (_, index) =>
      <div key={index} className="space-y-2">
        <Skeleton className="ml-4 h-4 w-28" />
        <div className="component-surface divide-y divide-medium">
          {Array.from({ length: index % 2 ? 3 : 4 }, (_, row) =>
            <div key={row} className="flex items-center gap-3 p-3 sm:p-4">
              <Skeleton className="size-5 rounded-full" />
              <SkeletonLine className={row % 2 ? 'w-3/5' : 'w-4/5'} />
            </div>,
          )}
        </div>
      </div>,
    )}
  </div>} />;
}

export function AdminStatsSkeleton() {
  return <AppGrid contentMain={<div
    className="max-w-xl w-full space-y-4 md:space-y-6"
    aria-busy="true"
  >
    <div className="component-surface p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) =>
          <div key={index} className="space-y-2">
            <Skeleton className="h-6 w-14" />
            <SkeletonLine className="w-20" />
          </div>,
        )}
      </div>
    </div>
    {Array.from({ length: 3 }, (_, index) =>
      <div key={index} className="space-y-2">
        <Skeleton className="ml-4 h-4 w-36" />
        <div className="component-surface divide-y divide-medium">
          {Array.from({ length: 3 }, (_, row) =>
            <div key={row} className="flex items-center gap-3 p-3 sm:p-4">
              <Skeleton className="size-5 rounded-full" />
              <SkeletonLine className={row % 2 ? 'w-1/2' : 'w-3/4'} />
            </div>,
          )}
        </div>
      </div>,
    )}
  </div>} />;
}

export function AdminConfigurationSkeleton() {
  return <AppGrid
    contentSide={<div className="hidden space-y-2 md:block" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) =>
        <SkeletonLine key={index} className={index % 3 ? 'w-28' : 'w-36'} />,
      )}
    </div>}
    contentMain={<div className="space-y-8" aria-busy="true">
      {Array.from({ length: 7 }, (_, index) =>
        <section key={index} className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <div className="space-y-3 rounded-lg border border-medium p-4 sm:p-5">
            {Array.from({ length: index % 2 ? 3 : 4 }, (_, row) =>
              <div key={row} className="grid gap-2 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1.3fr)] sm:items-center">
                <SkeletonLine className="w-28" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>,
            )}
          </div>
        </section>,
      )}
    </div>}
  />;
}

export function AdminComponentsSkeleton() {
  return <AppGrid contentMain={<div className="flex flex-col gap-4" aria-busy="true">
    <div className="flex gap-1">
      {Array.from({ length: 4 }, (_, index) =>
        <Skeleton key={index} className="size-6 rounded-md" />,
      )}
    </div>
    <Skeleton className="h-10 w-full rounded-md" />
    <Skeleton className="h-10 w-full rounded-md" />
    <Skeleton className="mt-12 h-12 w-full rounded-md" />
  </div>} />;
}

export function AdminAlbumEditSkeleton() {
  return <AppGrid contentMain={<div className="space-y-5" aria-busy="true">
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) =>
          <Skeleton key={index} className="h-10 w-full rounded-md" />,
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) =>
          <Skeleton key={index} className="aspect-video w-full rounded-[3px]" />,
        )}
      </div>
    </div>
  </div>} />;
}

export function AdminLibraryValueEditSkeleton() {
  return <AppGrid contentMain={<div className="space-y-5" aria-busy="true">
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) =>
          <Skeleton key={index} className="aspect-video w-full rounded-[3px]" />,
        )}
      </div>
    </div>
  </div>} />;
}

export function AdminRecipeEditSkeleton() {
  return <AppGrid contentMain={<div className="space-y-5" aria-busy="true">
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-28 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) =>
          <Skeleton key={index} className="aspect-video w-full rounded-[3px]" />,
        )}
      </div>
    </div>
  </div>} />;
}

export function AdminMediaEditSkeleton() {
  return <AppGrid contentMain={<div className="space-y-5" aria-busy="true">
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full rounded-md" />
        {Array.from({ length: 8 }, (_, index) =>
          <Skeleton key={index} className="h-10 w-full rounded-md" />,
        )}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, index) =>
          <Skeleton key={index} className="h-9 w-full rounded-md" />,
        )}
      </div>
    </div>
  </div>} />;
}

export function AdminUploadDetailSkeleton() {
  return <AppGrid contentMain={<div className="space-y-5" aria-busy="true">
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full rounded-md" />
        {Array.from({ length: 6 }, (_, index) =>
          <Skeleton key={index} className="h-10 w-full rounded-md" />,
        )}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, index) =>
          <Skeleton key={index} className="h-9 w-full rounded-md" />,
        )}
      </div>
    </div>
  </div>} />;
}
