import { auth } from '@/auth/server';
import SignInForm from '@/auth/SignInForm';
import { PATH_ADMIN, PATH_ROOT, PATH_SETUP, PATH_VERIFY_LOGIN } from '@/app/path';
import { clsx } from 'clsx/lite';
import { redirect } from 'next/navigation';
import LinkWithStatus from '@/components/LinkWithStatus';
import { IoArrowBack } from 'react-icons/io5';
import { getAppText } from '@/i18n/state/server';
import AuthPageShell from '@/auth/AuthPageShell';
import { hasActiveSuperAdmin } from '@/auth/users';
import { isGoogleAuthConfigured } from '@/auth/config';
import { getSiteAccessSettingsForAuthorization } from '@/auth/site-access';

export default async function SignInPage() {
  if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
  const session = await auth();

  if (session?.user?.twoFactorPending) {
    redirect(PATH_VERIFY_LOGIN);
  }

  if (session?.user) {
    redirect(session.user.role === 'admin' || session.user.role === 'superadmin'
      ? PATH_ADMIN
      : PATH_ROOT);
  }

  const [appText, siteAccessSettings] = await Promise.all([
    getAppText(),
    getSiteAccessSettingsForAuthorization(),
  ]);
  
  return (
    <AuthPageShell>
      <SignInForm
        googleSignInEnabled={isGoogleAuthConfigured()}
        newRegistrationsEnabled={
          siteAccessSettings.newRegistrationsEnabled
        }
      />
      {siteAccessSettings.siteVisibility === 'public' && <LinkWithStatus
        href={PATH_ROOT}
        className={clsx(
          'flex items-center gap-2.5',
          'text-lg',
        )}
      >
        <IoArrowBack className="translate-y-[1px]" />
        {appText.nav.home}
      </LinkWithStatus>}
    </AuthPageShell>
  );
}
