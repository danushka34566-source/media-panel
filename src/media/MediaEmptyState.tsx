import Container from '@/components/Container';
import AppGrid from '@/components/AppGrid';
import {
  IS_APP_READY,
} from '@/app/config';
import AdminAppConfiguration from '@/admin/config/AdminAppConfiguration';
import { clsx } from 'clsx/lite';
import { HiOutlinePhotograph } from 'react-icons/hi';
import { revalidatePath } from 'next/cache';
import SignInOrUploadClient from '@/admin/SignInOrUploadClient';
import Link from 'next/link';
import { PATH_ADMIN_CONFIGURATION } from '@/app/path';
import { getAppText } from '@/i18n/state/server';
import { auth } from '@/auth/server';
import { hasCapability } from '@/auth/permissions';

export default async function MediaEmptyState() {
  const [appText, session] = await Promise.all([getAppText(), auth()]);
  const canManageConfiguration = hasCapability(
    session?.user?.role,
    'manage-configuration',
  );

  return (
    <AppGrid
      contentMain={
        <Container
          key="MediaEmptyState"
          className="min-h-[20rem] sm:min-h-[30rem] px-8"
          padding="loose"
        >
          <HiOutlinePhotograph
            className="text-medium"
            size={24}
          />
          <div className={clsx(
            'font-bold text-2xl',
            'text-gray-700 dark:text-gray-200',
          )}>
            {!IS_APP_READY
              ? appText.onboarding.setupIncomplete
              : appText.onboarding.setupComplete}
          </div>
          {!IS_APP_READY && canManageConfiguration
            ? <AdminAppConfiguration simplifiedView />
            : <div className="max-w-md text-center space-y-6">
              <SignInOrUploadClient
                shouldResize={false}
                onLastUpload={async () => {
                  'use server';
                  // Update upload count in admin nav
                  revalidatePath('/admin', 'layout');
                }}
              />
              {canManageConfiguration && <div>
                {appText.onboarding.setupConfig}
                {' '}
                <Link
                  href={PATH_ADMIN_CONFIGURATION}
                  className="text-main hover:underline"
                >
                  /admin/configuration
                </Link>
              </div>}
            </div>}
        </Container>
      }
    />
  );
};
