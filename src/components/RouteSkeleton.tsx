'use client';

import { usePathname } from 'next/navigation';
import { AdminPageSkeleton } from './PageSkeletons';
import PageSpinner from './PageSpinner';

export default function RouteSkeleton() {
  const pathname = usePathname() ?? '/';
  if (pathname.startsWith('/admin')) { return <AdminPageSkeleton />; }
  // Public routes render their own media-aware loading states once the route
  // has streamed. Keep the route boundary non-skeleton and non-blank while
  // the server fetch is still pending.
  return <PageSpinner />;
}
