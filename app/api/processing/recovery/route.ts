import { NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { runProcessingOrchestratorRecovery } from '@/processing/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST() {
  if (!await isSessionAuthorized('edit')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runProcessingOrchestratorRecovery();
    return NextResponse.json({
      ...result,
      message: result.triggered
        ? result.statusMessage || 'Registration recovery scan queued'
        : 'Registration recovery is disabled or not configured',
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : 'Unable to queue registration recovery',
    }, { status: 502 });
  }
}
