import AdminAppConfiguration from '@/admin/config/AdminAppConfiguration';
import AdminAppConfigurationSidebar from
  '@/admin/config/AdminAppConfigurationSidebar';
import AdminInfoPage from '@/admin/AdminInfoPage';
import { APP_CONFIGURATION } from '@/app/config';
import { Suspense } from 'react';
import { auth } from '@/auth/server';
import { hasCapability } from '@/auth/permissions';
import { notFound } from 'next/navigation';

export default async function AdminAppConfigurationPage() {
  const session = await auth();
  if (!hasCapability(session?.user?.role, 'manage-configuration')) {
    notFound();
  }
  const { areInternalToolsEnabled } = APP_CONFIGURATION;
  return (
    <AdminInfoPage
      // Necessary because of useSearchParams usage in sidebar anchors
      contentSide={<Suspense>
        <AdminAppConfigurationSidebar
          {...{ areInternalToolsEnabled }}
        />
      </Suspense>}
    >
      <AdminAppConfiguration />
    </AdminInfoPage>
  );
}
