import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { clearWorkerRegistrationStatusForUrl } from '@/admin/processing/server';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest) {
  if (!await isSessionAuthorized('delete')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    url?: string
    sourceUrl?: string
  };
  const url = body.url?.trim();
  const sourceUrl = body.sourceUrl?.trim();

  if (!url && !sourceUrl) {
    return NextResponse.json({
      error: 'URL is required',
    }, { status: 400 });
  }

  try {
    if (sourceUrl) {
      await clearWorkerRegistrationStatusForUrl(sourceUrl);
    }
    if (url && url !== sourceUrl) {
      await clearWorkerRegistrationStatusForUrl(url);
    }
    return NextResponse.json({
      ok: true,
      statusMessage: 'Failed registration removed',
    });
  } catch (error) {
    console.error('Failed to clear registration record', error);
    return NextResponse.json({
      error: 'Unable to remove failed registration',
    }, { status: 500 });
  }
}
