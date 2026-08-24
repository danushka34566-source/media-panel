import AdminNav from '@/admin/AdminNav';
import { Suspense } from 'react';
import { AdminNavSkeleton } from '@/components/PageSkeletons';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 space-y-4">
      <Suspense fallback={<AdminNavSkeleton />}>
        <AdminNav />
      </Suspense>
      {children}
    </div>
  );
}
