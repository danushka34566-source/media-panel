import { NextRequest, NextResponse } from 'next/server';
import {
  ACTIVE_POSTGRES_URL,
  POSTGRES_SSL_DISABLED,
} from '@/app/config';
import { getProcessingSettingsSafe } from '@/processing/settings';
import { getProcessingConnectionSettingsSafe } from '@/processing/connection-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const value = (input?: string) => input?.trim() || undefined;

const publicUrl = (input?: string) => {
  const normalized = value(input);
  if (!normalized) { return undefined; }
  return /^https?:\/\//i.test(normalized)
    ? normalized.replace(/\/+$/, '')
    : `https://${normalized.replace(/\/+$/, '')}`;
};

export async function POST(request: NextRequest) {
  const connection = await getProcessingConnectionSettingsSafe();
  const bearer = request.headers.get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!connection.orchestratorSharedSecret ||
    bearer !== connection.orchestratorSharedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getProcessingSettingsSafe();
  const panelBaseUrl = publicUrl(process.env.NEXT_PUBLIC_DOMAIN) ||
    request.nextUrl.origin;
  const config: Record<string, string | undefined> = {
    POSTGRES_URL: value(ACTIVE_POSTGRES_URL),
    // Pass the resolved provider-aware value so the Worker does not need a
    // second guess about Supabase versus Neon. Explicit env overrides have
    // already been applied by config.ts.
    DISABLE_POSTGRES_SSL: POSTGRES_SSL_DISABLED ? '1' : '0',
    MEDIA_PANEL_BASE_URL: panelBaseUrl,
    AUTOMATION_API_SECRET: connection.orchestratorSharedSecret,
    BACKEND_ORCHESTRATOR_SHARED_SECRET: connection.orchestratorSharedSecret,
    BACKEND_PROCESSOR_SHARED_SECRET: connection.processorSharedSecret,
    DRIVE_STORAGE_BASE_URL: value(process.env.DRIVE_STORAGE_BASE_URL),
    DRIVE_STORAGE_API_KEY: value(process.env.DRIVE_STORAGE_API_KEY),
    DRIVE_STORAGE_PROJECT_ID: value(
      process.env.NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID,
    ),
    DRIVE_STORAGE_BUCKET: value(
      process.env.NEXT_PUBLIC_DRIVE_STORAGE_BUCKET,
    ),
    R2_PUBLIC_BASE_URL: publicUrl(
      process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN,
    ),
    R2_ACCOUNT_ID: value(
      process.env.NEXT_PUBLIC_CLOUDFLARE_R2_ACCOUNT_ID,
    ),
    R2_BUCKET: value(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_BUCKET),
    R2_ACCESS_KEY_ID: value(process.env.CLOUDFLARE_R2_ACCESS_KEY),
    R2_SECRET_ACCESS_KEY: value(
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    ),
    UNIQUE_MEDIA_NAMES: process.env.NEXT_PUBLIC_UNIQUE_MEDIA_NAMES === '0'
      ? '0'
      : '1',
    REGISTER_BATCH_SIZE: String(settings.registerBatchSize),
    MAX_REGISTER_PASSES: String(settings.maxRegisterPasses),
    STALE_PROCESSING_MINUTES: String(settings.staleProcessingMinutes),
    STALE_REGISTRATION_MINUTES: String(settings.staleRegistrationMinutes),
    REGISTRATION_HISTORY_DAYS: String(settings.registrationHistoryDays),
    BACKEND_PROCESSOR_POLL_INTERVAL_MS: String(
      settings.processorPollIntervalMs,
    ),
    BACKEND_PROCESSOR_IDLE_INTERVAL_MS: String(
      settings.processorIdleIntervalMs,
    ),
    BACKEND_PROCESSOR_HEARTBEAT_INTERVAL_MS: String(
      settings.processorHeartbeatIntervalMs,
    ),
    BACKEND_PROCESSOR_CLAIM_LIMIT: String(settings.processorClaimLimit),
  };

  const missing = [
    'POSTGRES_URL',
    'BACKEND_PROCESSOR_SHARED_SECRET',
  ].filter(key => !config[key]);
  const hasDrive = [
    'DRIVE_STORAGE_BASE_URL',
    'DRIVE_STORAGE_API_KEY',
    'DRIVE_STORAGE_PROJECT_ID',
    'DRIVE_STORAGE_BUCKET',
  ].every(key => Boolean(config[key]));
  const hasR2 = [
    'R2_PUBLIC_BASE_URL',
    'R2_ACCOUNT_ID',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ].every(key => Boolean(config[key]));
  if (!hasDrive && !hasR2) { missing.push('STORAGE_CONFIGURATION'); }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Worker configuration is incomplete', missing },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    Object.fromEntries(Object.entries(config).filter(([, item]) => item)),
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
