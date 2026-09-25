import { clsx } from 'clsx/lite';

export default function AuthPageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={clsx(
      'page-under-header mx-auto flex min-h-[calc(100svh-var(--site-header-height))] w-full flex-col items-center justify-center gap-6',
      'p-4 sm:p-6 md:p-10',
      className,
    )}>
      {children}
    </div>
  );
}
