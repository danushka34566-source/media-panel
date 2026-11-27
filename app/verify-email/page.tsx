import { VerifyEmailForm } from '@/auth/AuthFlowForms';
import AuthPageShell from '@/auth/AuthPageShell';
import { hasActiveSuperAdmin } from '@/auth/users';
import { PATH_SETUP, PATH_SIGN_IN } from '@/app/path';
import { redirect } from 'next/navigation';
import { auth } from '@/auth/server';
import { isVerifiedSession } from '@/auth/session';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string, sent?: string, purpose?: string }>
}) {
  if (!(await hasActiveSuperAdmin())) { redirect(PATH_SETUP); }
  const { email, sent, purpose } = await searchParams;
  const isEmailChange = purpose === 'email-change';
  if (isEmailChange && !isVerifiedSession(await auth())) {
    redirect(PATH_SIGN_IN);
  }
  return (
    <AuthPageShell>
      <VerifyEmailForm
        initialEmail={email}
        initialDeliveryFailed={sent === '0'}
        initialDeliverySucceeded={sent === '1'}
        isEmailChange={isEmailChange}
      />
    </AuthPageShell>
  );
}
