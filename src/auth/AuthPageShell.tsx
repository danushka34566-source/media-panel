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
      'relative isolate mx-auto flex min-h-[calc(100dvh-4rem)] w-full',
      'flex-col items-center justify-center gap-5 py-5 sm:py-8',
      className,
    )}>
      <div aria-hidden="true" className="auth-flow-ambient" />
      <div className="relative z-10 flex w-full flex-col items-center gap-5">
        {children}
      </div>
    </div>
  );
}
