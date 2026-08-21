import { SignUpForm } from '@/auth/AuthFlowForms';
import { auth } from '@/auth/server';
import { PATH_ADMIN, PATH_ROOT, PATH_SETUP, PATH_SIGN_IN } from '@/app/path';
import { redirect } from 'next/navigation';
import AuthPageShell from '@/auth/AuthPageShell';
import { hasActiveSuperAdmin } from '@/auth/users';
import { getSiteAccessSettingsForAuthorization } from '@/auth/site-access';

export default async function SignUpPage() {
  if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
  const { newRegistrationsEnabled } =
    await getSiteAccessSettingsForAuthorization();
  if (!newRegistrationsEnabled) { redirect(PATH_SIGN_IN); }
  const session = await auth();
  if (session?.user?.status === 'active') {
    redirect(
      session.user.role === 'admin' || session.user.role === 'superadmin'
        ? PATH_ADMIN
        : PATH_ROOT,
    );
  }
  return (
    <AuthPageShell>
      <SignUpForm />
    </AuthPageShell>
  );
}
