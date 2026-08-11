import { APP_CONFIGURATION } from '@/app/config';
import { isSessionAuthorized } from '@/auth/api';

export async function GET() {
  if (!await isSessionAuthorized('manage-configuration')) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return Response.json(APP_CONFIGURATION);
};
