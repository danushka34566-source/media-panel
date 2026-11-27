import { getCurrentUserAction } from '@/auth/actions';
import ProfileClient from '@/auth/ProfileClient';
import { redirect } from 'next/navigation';
import { PATH_SIGN_IN } from '@/app/path';
import { isGoogleAuthConfigured } from '@/auth/config';

export default async function ProfilePage({ searchParams }: {
  searchParams: Promise<{ googleLink?: string }>
}) {
  const user = await getCurrentUserAction();

  if (!user) {
    redirect(PATH_SIGN_IN);
  }

  return <ProfileClient
    user={user}
    googleSignInEnabled={isGoogleAuthConfigured()}
    googleLinkUnmatched={(await searchParams).googleLink === 'unmatched'}
  />;
}
