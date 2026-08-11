import { auth } from '@/auth/server';
import { PATH_SIGN_IN } from '@/app/path';
import HttpStatusPage from '@/components/HttpStatusPage';
import { redirect } from 'next/navigation';

export default async function AccessDeniedPage() {
  const session = await auth();
  if (!session?.user) { redirect(PATH_SIGN_IN); }
  return (
    <HttpStatusPage status={403}>
      Your account does not have permission to open this page.
    </HttpStatusPage>
  );
}
