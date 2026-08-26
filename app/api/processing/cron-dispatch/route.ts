import { NextRequest, NextResponse } from 'next/server';
import {
  getProcessingConnectionSettingsSafe,
} from '@/processing/connection-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALLOWED_CRONS = new Set(['* * * * *', '*/2 * * * *']);

export async function POST(request: NextRequest) {
  const connection = await getProcessingConnectionSettingsSafe();
  const bearer = request.headers.get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!connection.orchestratorBaseUrl ||
    !connection.orchestratorSharedSecret ||
    bearer !== connection.orchestratorSharedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { cron?: unknown };
  const cron = typeof body.cron === 'string' ? body.cron : '';
  if (!ALLOWED_CRONS.has(cron)) {
    return NextResponse.json(
      { error: 'Unsupported registration schedule' },
      { status: 400 },
    );
  }

  const baseUrl = connection.orchestratorBaseUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${baseUrl}/internal/scheduled-registration`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cron }),
      cache: 'no-store',
      signal: AbortSignal.timeout(110_000),
    },
  );
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
