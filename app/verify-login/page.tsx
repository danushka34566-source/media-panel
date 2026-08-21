import { auth } from '@/auth/server';
import CompleteSignInVerificationForm from '@/auth/CompleteSignInVerificationForm';
import { PATH_ADMIN, PATH_SIGN_IN } from '@/app/path';
import { redirect } from 'next/navigation';
import AuthPageShell from '@/auth/AuthPageShell';
import { findUserById } from '@/auth/users';
import type { TwoFactorMethod } from '@/auth';

export default async function VerifyLoginPage() {
  const session = await auth();

  if (!session?.user?.id || session.user.status !== 'active') {
    redirect(PATH_SIGN_IN);
  }

  if (!session.user.twoFactorPending) {
    redirect(PATH_ADMIN);
  }

  const user = session.user.id
    ? await findUserById(session.user.id)
    : undefined;
  const availableMethods: TwoFactorMethod[] = [
    ...(user?.totpEnabled ? ['authenticator' as const] : []),
    'email',
    ...(user?.mobileVerified && user.mobileNumber ? ['sms' as const] : []),
  ];
  const defaultMethod: TwoFactorMethod = user?.totpEnabled
    ? 'authenticator'
    : 'email';

  return (
    <AuthPageShell>
      <CompleteSignInVerificationForm
        defaultMethod={defaultMethod}
        availableMethods={availableMethods}
      />
    </AuthPageShell>
  );
}
