import { NextRequest, NextResponse } from 'next/server';
import { isAutomationApiAuthorized } from '@/auth/api';
import { revalidateAllKeysAndPaths, revalidateMedia } from '@/media/cache';
import { BACKEND_ORCHESTRATOR_SHARED_SECRET } from '@/app/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (
    !await isAutomationApiAuthorized(req) &&
    (!BACKEND_ORCHESTRATOR_SHARED_SECRET ||
      bearer !== BACKEND_ORCHESTRATOR_SHARED_SECRET)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { photoId?: string };
  const photoId = body.photoId?.trim();

  if (photoId) {
    revalidateMedia(photoId);
  } else {
    revalidateAllKeysAndPaths();
  }

  return NextResponse.json({ ok: true, photoId: photoId || null });
}
