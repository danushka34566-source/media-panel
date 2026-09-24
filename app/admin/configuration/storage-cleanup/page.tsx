import { notFound } from 'next/navigation';
import { auth } from '@/auth/server';
import { hasCapability } from '@/auth/permissions';
import AdminInfoPage from '@/admin/AdminInfoPage';
import StorageCleanupClient from '@/admin/storage-cleanup/StorageCleanupClient';
import { getStorageCleanupSnapshot } from '@/admin/storage-cleanup/actions';

export const dynamic = 'force-dynamic';

export default async function StorageCleanupPage() {
  const session = await auth();
  if (!hasCapability(session?.user?.role, 'manage-configuration')) notFound();
  const snapshot = await getStorageCleanupSnapshot();
  return <AdminInfoPage><StorageCleanupClient initial={snapshot} /></AdminInfoPage>;
}
