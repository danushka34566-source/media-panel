import { auth } from '@/auth/server';
import CompleteSignInVerificationForm from '@/auth/CompleteSignInVerificationForm';
import { PATH_ADMIN, PATH_ROOT, PATH_SIGN_IN } from '@/app/path';
import { redirect } from 'next/navigation';
import AuthPageShell from '@/auth/AuthPageShell';
import { findUserById } from '@/auth/users';
import { KEY_CALLBACK_URL, type TwoFactorMethod } from '@/auth';
import { getAuthCallbackPath, pathForAuthCallback } from '@/auth/redirects';

export default async function VerifyLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const callbackUrl = getAuthCallbackPath((await searchParams)[KEY_CALLBACK_URL]);
  const session = await auth();

  if (!session?.user?.id || session.user.status !== 'active') {
    redirect(pathForAuthCallback(PATH_SIGN_IN, callbackUrl));
  }

  if (!session.user.twoFactorPending) {
    const fallback = session.user.role === 'admin' || session.user.role === 'superadmin'
      ? PATH_ADMIN
      : PATH_ROOT;
    redirect(callbackUrl ?? fallback);
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
        callbackUrl={callbackUrl}
      />
    </AuthPageShell>
  );
}
