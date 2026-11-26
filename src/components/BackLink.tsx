'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ComponentProps } from 'react';
import { goBackOrReplace } from '@/utility/back-navigation';

export default function BackLink({
  href,
  matchPath,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & {
  href: string
  matchPath?: boolean
}) {
  const router = useRouter();
  return <Link {...props} href={href} onNavigate={event => {
    event.preventDefault();
    goBackOrReplace(router, href, matchPath);
  }} />;
}
