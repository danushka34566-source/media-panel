import { auth } from '@/auth/server';
import SignInForm from '@/auth/SignInForm';
import { PATH_ADMIN, PATH_ROOT, PATH_SETUP, PATH_VERIFY_LOGIN } from '@/app/path';
import { clsx } from 'clsx/lite';
import { redirect } from 'next/navigation';
import BackLink from '@/components/BackLink';
import { IoArrowBack } from 'react-icons/io5';
import { getAppText } from '@/i18n/state/server';
import AuthPageShell from '@/auth/AuthPageShell';
import { hasActiveSuperAdmin } from '@/auth/users';
import { isGoogleAuthConfigured } from '@/auth/config';
import { getSiteAccessSettingsForAuthorization } from '@/auth/site-access';
import { KEY_CALLBACK_URL } from '@/auth';
import { getAuthCallbackPath, pathForAuthCallback } from '@/auth/redirects';
import { isLocalAuthBypassRequested } from '@/auth/local-audit-bypass';

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (isLocalAuthBypassRequested()) { redirect(PATH_ROOT); }
  if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
  const session = await auth();

  const activeUser = session?.user?.status === 'active' ? session.user : undefined;

  if (activeUser) {
    const callback = getAuthCallbackPath((await searchParams)[KEY_CALLBACK_URL]);
    if (activeUser.twoFactorPending) {
      redirect(pathForAuthCallback(PATH_VERIFY_LOGIN, callback));
    }
    const fallback = activeUser.role === 'admin' || activeUser.role === 'superadmin'
      ? PATH_ADMIN
      : PATH_ROOT;
    redirect(callback ?? fallback);
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
      {siteAccessSettings.siteVisibility === 'public' && <BackLink
        href={PATH_ROOT}
        matchPath
        className={clsx(
          'flex items-center gap-2.5',
          'font-sans text-sm font-medium text-medium',
        )}
      >
        <IoArrowBack className="translate-y-[1px]" />
        {appText.nav.home}
      </BackLink>}
    </AuthPageShell>
  );
}
