'use client';

import { usePathname } from 'next/navigation';
import { clsx } from 'clsx/lite';
import { isPathSignIn } from '@/app/path';

export default function AuthPageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const pathname = usePathname();
  const hasSiteHeader = !isPathSignIn(pathname) && pathname !== '/verify-login';

  return (
    <div className={clsx(
      'auth-flow-page mx-auto flex w-full flex-col items-center justify-center gap-6',
      hasSiteHeader ? 'min-h-[calc(100svh-4rem)]' : 'min-h-svh',
      'p-4 sm:p-6 md:p-10',
      className,
    )}>
      {children}
    </div>
  );
}
