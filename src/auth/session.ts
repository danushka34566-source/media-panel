import type { Session } from 'next-auth';

export const isVerifiedSession = (
  session: Session | null | undefined,
): session is Session & { user: { id: string } } => Boolean(
  session?.user?.id && session.user.status === 'active' &&
  !session.user.twoFactorPending,
);
