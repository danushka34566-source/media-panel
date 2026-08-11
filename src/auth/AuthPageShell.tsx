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
      'mx-auto flex min-h-[calc(100dvh-8rem)] w-full',
      'flex-col items-center justify-center gap-5 py-5 sm:py-8',
      className,
    )}>
      {children}
    </div>
  );
}
