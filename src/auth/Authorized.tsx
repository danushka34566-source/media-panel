import { authCachedSafe } from './cache';
import { hasCapability, type AuthCapability } from './permissions';

export default async function Authorized({
  capability,
  children,
}: {
  capability: AuthCapability
  children: React.ReactNode
}) {
  const session = await authCachedSafe();
  return session?.user?.status === 'active' &&
      hasCapability(session.user.role, capability)
    ? children
    : null;
}
