import { redirect } from 'next/navigation';
import AuthPageShell from '@/auth/AuthPageShell';
import SetupForm from '@/auth/SetupForm';
import { hasActiveSuperAdmin } from '@/auth/users';
import { PATH_SIGN_IN } from '@/app/path';
import { isGoogleAuthConfigured } from '@/auth/config';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await hasActiveSuperAdmin()) { redirect(PATH_SIGN_IN); }
  return <AuthPageShell>
    <SetupForm googleSignInEnabled={isGoogleAuthConfigured()} />
  </AuthPageShell>;
}
