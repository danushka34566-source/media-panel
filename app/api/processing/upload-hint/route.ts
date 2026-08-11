import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { runProcessingOrchestrator } from '@/processing/orchestrator';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!await isSessionAuthorized('upload')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Retained as a manual scan trigger for older clients. It deliberately does
  // not create hints or registration rows: storage scanning is the worker's
  // responsibility, regardless of how the object was uploaded.
  await req.json().catch(() => ({}));

  try {
    const result = await runProcessingOrchestrator();
    return NextResponse.json({
      ok: true,
      triggered: result.triggered,
      statusMessage: result.triggered
        ? 'Worker scan requested'
        : 'Worker cron will scan storage',
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
