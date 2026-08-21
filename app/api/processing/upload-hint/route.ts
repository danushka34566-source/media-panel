import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { retryWorkerRegistration } from '@/processing/orchestrator';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!await isSessionAuthorized('upload')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    url?: string
    sourceUrl?: string
  };
  const url = body.url?.trim();
  const sourceUrl = body.sourceUrl?.trim();
  if (!url) {
    return NextResponse.json({ error: 'Registration URL is required' }, { status: 400 });
  }

  try {
    const result = await retryWorkerRegistration({ url, sourceUrl });
    return NextResponse.json({
      ok: true,
      triggered: result.triggered,
      statusMessage: result.statusMessage || (result.triggered
        ? 'Registration requeued for worker retry'
        : 'Worker cron will scan storage'),
    });
  } catch (error) {
    console.error('Failed to trigger Backend Orchestrator', error);
    return NextResponse.json({
      ok: true,
      triggered: false,
      statusMessage: 'Worker trigger failed; cron will scan storage',
    }, { status: 202 });
  }
}
