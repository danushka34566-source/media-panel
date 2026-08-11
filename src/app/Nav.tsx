import NavClient from './NavClient';
import { NAV_CAPTION, NAV_TITLE } from './config';
import type { Session } from 'next-auth';

export default async function Nav({ session }: { session?: Session | null }) {
  return <NavClient
    navTitle={NAV_TITLE}
    navCaption={NAV_CAPTION}
    animate
    user={session?.user?.id && session.user.status === 'active'
      ? {
          name: session.user.name ?? undefined,
          email: session.user.email ?? undefined,
          profileImageUrl: session.user.image ?? undefined,
        }
      : undefined}
  />; 
}
