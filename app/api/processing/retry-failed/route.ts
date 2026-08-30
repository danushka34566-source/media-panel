import { NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import {
  retryAllFailedProcessing,
  retryAllFailedRegistrations,
} from '@/processing/orchestrator';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!await isSessionAuthorized('edit')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({})) as { type?: string };
    const result = body.type === 'registration'
      ? await retryAllFailedRegistrations()
      : await retryAllFailedProcessing();
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to retry failed processing jobs',
    }, { status: 502 });
  }
}
