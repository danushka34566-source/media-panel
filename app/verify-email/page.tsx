import { VerifyEmailForm } from '@/auth/AuthFlowForms';
import AuthPageShell from '@/auth/AuthPageShell';
import { hasActiveSuperAdmin } from '@/auth/users';
import { PATH_SETUP } from '@/app/path';
import { redirect } from 'next/navigation';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
  const { email } = await searchParams;
  return (
    <AuthPageShell>
      <VerifyEmailForm initialEmail={email} />
    </AuthPageShell>
  );
}
