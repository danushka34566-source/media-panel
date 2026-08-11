import { PasswordResetForm } from '@/auth/AuthFlowForms';
import AuthPageShell from '@/auth/AuthPageShell';
import { hasActiveSuperAdmin } from '@/auth/users';
import { PATH_SETUP } from '@/app/path';
import { redirect } from 'next/navigation';

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string, sent?: string }>
}) {
  if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
  const { email, sent } = await searchParams;
  return (
    <AuthPageShell>
      <PasswordResetForm initialEmail={email} codeSent={sent === '1'} />
    </AuthPageShell>
  );
}
