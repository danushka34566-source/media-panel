'use client';

import { usePathname } from 'next/navigation';
import { AdminPageSkeleton } from './PageSkeletons';

export default function RouteSkeleton() {
  const pathname = usePathname() ?? '/';
  if (pathname.startsWith('/admin')) { return <AdminPageSkeleton />; }
  // Public grid, full-list, and detail routes render their own media-aware
  // loading states. The generic app fallback only caused a second skeleton to
  // flash over those pages during navigation.
  return null;
}
