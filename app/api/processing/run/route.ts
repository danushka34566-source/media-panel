import { NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { runProcessingOrchestrator } from '@/processing/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST() {
  if (!await isSessionAuthorized('edit')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runProcessingOrchestrator();
    return NextResponse.json({
      ...result,
      message: result.triggered
        ? 'Recovery scan queued; the worker lease will prevent duplicate scans'
        : 'Recovery scan was not queued because processing is disabled',
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : 'Unable to queue recovery scan',
    }, { status: 502 });
  }
}
