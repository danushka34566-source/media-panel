'use client';

import { usePathname } from 'next/navigation';
import {
  AdminPageSkeleton,
  MediaDetailSkeleton,
  MediaFullSkeleton,
  MediaGridSkeleton,
} from './PageSkeletons';

const isDetailPath = (pathname: string) => {
  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  return Boolean(lastSegment && /^\d{12}$/.test(lastSegment));
};

export default function RouteSkeleton() {
  const pathname = usePathname() ?? '/';
  if (pathname.startsWith('/admin')) { return <AdminPageSkeleton />; }
  if (isDetailPath(pathname)) { return <MediaDetailSkeleton />; }
  if (pathname === '/full' || pathname.endsWith('/full')) {
    return <MediaFullSkeleton />;
  }
  return <MediaGridSkeleton withSidebar={!pathname.startsWith('/search')} />;
}
