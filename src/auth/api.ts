import { auth } from './server';
import { hasCapability, type AuthCapability } from './permissions';

const AUTOMATION_SHARED_SECRET =
  process.env.AUTOMATION_API_SECRET ??
  process.env.CLOUDFLARE_WORKER_SHARED_SECRET ??
  '';

const getBearerToken = (authorization?: string | null) => {
  if (!authorization) { return undefined; }
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || !token) { return undefined; }
  return scheme.toLowerCase() === 'bearer' ? token : undefined;
};

export const isSessionAuthorized = async (capability: AuthCapability) => {
  const session = await auth();
  return session?.user?.status === 'active' &&
    hasCapability(session.user.role, capability);
};

export const isAutomationApiAuthorized = async (
  request: Request,
  capability: AuthCapability = 'upload',
) => {
  if (await isSessionAuthorized(capability)) { return true; }

  if (!AUTOMATION_SHARED_SECRET) { return false; }
  const bearerToken = getBearerToken(request.headers.get('authorization'));
  return bearerToken === AUTOMATION_SHARED_SECRET;
};
