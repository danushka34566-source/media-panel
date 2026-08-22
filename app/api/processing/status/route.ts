import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { getProcessingConnectionSettingsSafe } from '@/processing/connection-settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const STATUS_TIMEOUT_MS = 20_000;

const isTimeoutError = (error: unknown) =>
  error instanceof Error && (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    /timed? out|timeout|aborted/i.test(error.message)
  );

const conciseStatusError = (value: unknown) => {
  const message = typeof value === 'string' ? value : '';
  if (/missing from-clause|syntax error|postgres query failed/i.test(message)) {
    return 'Database status query failed; retrying';
  }
  if (/connection terminated|connection reset|pooler|econnreset/i.test(message)) {
    return 'Database connection dropped; retrying';
  }
  if (/timed? out|timeout|aborted/i.test(message)) {
    return 'Database status check timed out; retrying';
  }
  if (!message) { return 'Backend status is temporarily unavailable; retrying'; }
  return message.length > 180 ? `${message.slice(0, 177)}…` : message;
};

export async function GET(request: NextRequest) {
  if (!await isSessionAuthorized('edit')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const connection = await getProcessingConnectionSettingsSafe();
  if (!connection.orchestratorBaseUrl ||
    !connection.orchestratorSharedSecret) {
    return NextResponse.json({ configured: false });
  }
  try {
    const rawQueueLimit = Number(request.nextUrl.searchParams.get('queueLimit'));
    const queueLimit = Number.isFinite(rawQueueLimit)
      ? Math.min(Math.max(Math.round(rawQueueLimit), 1), 5_000)
      : undefined;
    const statusUrl = new URL(
      `${connection.orchestratorBaseUrl.replace(/\/+$/, '')}/status`,
    );
    if (queueLimit) { statusUrl.searchParams.set('queueLimit', String(queueLimit)); }
    const response = await fetch(
      statusUrl,
      {
        headers: {
          Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(
      response.ok
        ? {
          configured: true,
          connected: true,
          checkedAt: new Date().toISOString(),
          ...data,
        }
        : {
          configured: true,
          connected: false,
          checkedAt: new Date().toISOString(),
          errorCode: 'upstream',
          error: conciseStatusError(
            data.error || `Backend Orchestrator returned ${response.status}`,
          ),
        },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error) {
    const timedOut = isTimeoutError(error);
    return NextResponse.json({
      configured: true,
      connected: false,
      checkedAt: new Date().toISOString(),
      errorCode: timedOut ? 'timeout' : 'connection',
      error: timedOut
        ? 'Status check timed out'
        : conciseStatusError(error instanceof Error
          ? error.message
          : 'Connection failed'),
    }, { status: 502 });
  }
}
