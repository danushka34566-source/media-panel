import { clsx } from 'clsx/lite';

export function Skeleton({
  className,
}: {
  className?: string
}) {
  return <div
    aria-hidden="true"
    className={clsx(
      'animate-pulse rounded-[3px] bg-black/[0.07] dark:bg-white/[0.08]',
      className,
    )}
  />;
}

export function SkeletonLine({
  className,
}: {
  className?: string
}) {
  return <Skeleton className={clsx('h-3', className)} />;
}
