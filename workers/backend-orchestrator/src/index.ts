import { neon } from '@neondatabase/serverless';
import { AwsClient } from 'aws4fetch';
import { Client } from 'pg';

type ScheduledController = {
  cron: string
  scheduledTime: number
};

type ExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
};

type R2ObjectLike = {
  key: string
  uploaded?: Date
  size?: number
};

type StorageListPage = {
  objects: R2ObjectLike[]
  nextContinuationToken?: string
};

type MediaRow = {
  id: string
  url: string
  extension: string
  poster_url: string | null
  preview_url: string | null
  transcode_status: string | null
};

type ClaimJobRow = {
  id: string
  url: string
  extension: string
  transcode_error: string | null
};

type CanonicalMediaRow = {
  id: string
  url: string
  extension: string
};

type RegistrationStatusRow = {
  url: string
  file_name?: string | null
  uploaded_at?: string | null
  status?: string | null
  source_url?: string | null
  original_file_name?: string | null
  title?: string | null
  media_id?: string | null
  extension?: string | null
  error_message?: string | null
  updated_at?: string | Date | null
};

type UploadRegistrationHintRow = {
  url: string
  original_file_name: string | null
  title: string | null
  updated_at?: string | Date | null
  created_at?: string | Date | null
};

export interface Env {
  POSTGRES_URL: string
  DISABLE_POSTGRES_SSL?: string
  MEDIA_PANEL_BASE_URL?: string
  AUTOMATION_API_SECRET?: string
  R2_PUBLIC_BASE_URL: string
  R2_ACCOUNT_ID: string
  R2_BUCKET: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  DRIVE_STORAGE_BASE_URL?: string
  DRIVE_STORAGE_API_KEY?: string
  DRIVE_STORAGE_PROJECT_ID?: string
  DRIVE_STORAGE_BUCKET?: string
  UNIQUE_MEDIA_NAMES?: string
  NEXT_PUBLIC_UNIQUE_MEDIA_NAMES?: string
  BACKEND_ORCHESTRATOR_SHARED_SECRET?: string
  BACKEND_PROCESSOR_SHARED_SECRET?: string
  REGISTER_BATCH_SIZE?: string
  MAX_REGISTER_PASSES?: string
  STALE_PROCESSING_MINUTES?: string
  STALE_REGISTRATION_MINUTES?: string
  REGISTRATION_HISTORY_DAYS?: string
  BACKEND_PROCESSOR_POLL_INTERVAL_MS?: string
  BACKEND_PROCESSOR_IDLE_INTERVAL_MS?: string
  BACKEND_PROCESSOR_HEARTBEAT_INTERVAL_MS?: string
  BACKEND_PROCESSOR_CLAIM_LIMIT?: string
  REGISTRATION_HINT_LOOKUPS_ENABLED?: string
  REGISTRATION_SCAN_DEADLINE_AT?: string
  REGISTRATION_SCHEDULED?: string
  REGISTRATION_DISCOVERY_ONLY?: string
  REGISTRATION_PROCESSOR_ONLY?: string
  REGISTRATION_PROCESSOR_PULL?: string
  PROCESSOR_REGISTRATION_ENABLED?: string
  PROCESSOR_ONLY_REGISTRATION?: string
}

type RuntimeProcessingSettings = {
  orchestratorEnabled: boolean
  registrationEnabled: boolean
  processorRegistrationEnabled: boolean
  processorOnlyRegistration: boolean
  videoProcessingEnabled: boolean
  registerBatchSize: number
  maxRegisterPasses: number
  staleProcessingMinutes: number
  staleRegistrationMinutes: number
  registrationHistoryDays: number
  processorPollIntervalMs: number
  processorIdleIntervalMs: number
  processorHeartbeatIntervalMs: number
  processorClaimLimit: number
};

let runtimeSettingsCache: {
  expiresAt: number
  settings: RuntimeProcessingSettings
} | undefined;
let hlsSchemaInitialization: Promise<void> | undefined;

const ensureHlsSchema = async (env: Env) => {
  if (hlsSchemaInitialization) return hlsSchemaInitialization;
  hlsSchemaInitialization = (async () => {
    const sql = sqlForEnv(env);
    await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS hls_manifest_url TEXT`;
    await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS hls_verified_at TIMESTAMP WITH TIME ZONE`;
    await sql`CREATE INDEX IF NOT EXISTS media_hls_reconciliation_idx
      ON media (hls_verified_at ASC NULLS FIRST, id ASC)
      WHERE media_type='video' AND transcode_status='ready'`;
  })().catch(error => {
    hlsSchemaInitialization = undefined;
    throw error;
  });
  return hlsSchemaInitialization;
};

const getRuntimeProcessingSettings = async (env: Env) => {
  if (runtimeSettingsCache && runtimeSettingsCache.expiresAt > Date.now()) {
    return runtimeSettingsCache.settings;
  }
  const defaults = getDefaultRuntimeProcessingSettings(env);
  try {
    const sql = sqlForEnv(env);
    // Cron invocations on the Workers Free plan have only 10 ms of CPU.
    // The configuration table is created by the panel/manual path; doing a
    // DDL round-trip on every fresh scheduled isolate can consume the entire
    // budget before the registration queue is claimed.
    if (env.REGISTRATION_SCHEDULED !== '1') {
      await sql`
        CREATE TABLE IF NOT EXISTS processing_configuration (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
    }
    const rows = await sql`SELECT key, value FROM processing_configuration` as
      unknown as { key: string, value: string }[];
    const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
    const enabled = (key: string, fallback: boolean) => values[key] === undefined
      ? fallback
      : values[key] === 'true' || values[key] === '1';
    const number = (key: string, fallback: number, min: number, max: number) => {
      const parsed = Number(values[key]);
      return Number.isFinite(parsed)
        ? Math.min(Math.max(Math.round(parsed), min), max)
        : fallback;
    };
    defaults.orchestratorEnabled = enabled('orchestratorEnabled', true);
    defaults.registrationEnabled = enabled('registrationEnabled', true);
    defaults.processorRegistrationEnabled = enabled('processorRegistrationEnabled', false);
    defaults.processorOnlyRegistration = enabled('processorOnlyRegistration', false);
    defaults.videoProcessingEnabled = enabled('videoProcessingEnabled', true);
    defaults.registerBatchSize = number('registerBatchSize', defaults.registerBatchSize, 1, 100);
    defaults.maxRegisterPasses = number('maxRegisterPasses', defaults.maxRegisterPasses, 1, 20);
    defaults.staleProcessingMinutes = number('staleProcessingMinutes', defaults.staleProcessingMinutes, 1, 1440);
    defaults.staleRegistrationMinutes = number('staleRegistrationMinutes', defaults.staleRegistrationMinutes, 1, 1440);
    defaults.registrationHistoryDays = number('registrationHistoryDays', defaults.registrationHistoryDays, 1, 365);
    defaults.processorPollIntervalMs = number('processorPollIntervalMs', defaults.processorPollIntervalMs, 1000, 300000);
    defaults.processorIdleIntervalMs = number('processorIdleIntervalMs', defaults.processorIdleIntervalMs, 1000, 300000);
    defaults.processorHeartbeatIntervalMs = number('processorHeartbeatIntervalMs', defaults.processorHeartbeatIntervalMs, 1000, 60000);
    defaults.processorClaimLimit = number('processorClaimLimit', defaults.processorClaimLimit, 1, 3);
  } catch (error) {
    console.warn('Using deployed processing configuration defaults', error);
  }
  runtimeSettingsCache = { expiresAt: Date.now() + 30_000, settings: defaults };
  return defaults;
};

const getDefaultRuntimeProcessingSettings = (env: Env): RuntimeProcessingSettings => ({
    orchestratorEnabled: true,
    registrationEnabled: true,
    processorRegistrationEnabled: false,
    processorOnlyRegistration: false,
    videoProcessingEnabled: true,
    registerBatchSize: getNumber(env.REGISTER_BATCH_SIZE, 2, { min: 1, max: 100 }),
    maxRegisterPasses: getNumber(env.MAX_REGISTER_PASSES, 2, { min: 1, max: 20 }),
    staleProcessingMinutes: getNumber(env.STALE_PROCESSING_MINUTES, 2, { min: 1, max: 1440 }),
    staleRegistrationMinutes: getNumber(env.STALE_REGISTRATION_MINUTES, 5, { min: 1, max: 1440 }),
    registrationHistoryDays: getNumber(env.REGISTRATION_HISTORY_DAYS, 14, { min: 1, max: 365 }),
    processorPollIntervalMs: getNumber(env.BACKEND_PROCESSOR_POLL_INTERVAL_MS, 5000, { min: 1000, max: 300000 }),
    processorIdleIntervalMs: getNumber(env.BACKEND_PROCESSOR_IDLE_INTERVAL_MS, 5000, { min: 1000, max: 300000 }),
    processorHeartbeatIntervalMs: getNumber(env.BACKEND_PROCESSOR_HEARTBEAT_INTERVAL_MS, 5000, { min: 1000, max: 60000 }),
    processorClaimLimit: getNumber(env.BACKEND_PROCESSOR_CLAIM_LIMIT, 1, { min: 1, max: 3 }),
});

const envWithRuntimeSettings = (
  env: Env,
  settings: RuntimeProcessingSettings,
): Env => ({
  ...env,
  REGISTER_BATCH_SIZE: String(settings.registerBatchSize),
  MAX_REGISTER_PASSES: String(settings.maxRegisterPasses),
  STALE_PROCESSING_MINUTES: String(settings.staleProcessingMinutes),
  STALE_REGISTRATION_MINUTES: String(settings.staleRegistrationMinutes),
  REGISTRATION_HISTORY_DAYS: String(settings.registrationHistoryDays),
  BACKEND_PROCESSOR_HEARTBEAT_INTERVAL_MS: String(settings.processorHeartbeatIntervalMs),
  PROCESSOR_REGISTRATION_ENABLED: settings.processorRegistrationEnabled ? '1' : '0',
  PROCESSOR_ONLY_REGISTRATION: settings.processorOnlyRegistration ? '1' : '0',
});

const MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'mp4',
  'mov',
  'webm',
  'mkv',
  'm4v',
  'avi',
  'ts',
  'm2ts',
  'mts',
  'mpg',
  'mpeg',
  'wmv',
  'flv',
  '3gp',
  'ogv',
]);
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'mov', 'm4v', 'webm', 'avi', 'ts', 'm2ts', 'mts',
  'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ogv',
]);
const PRESERVED_VIDEO_EXTENSIONS = new Set(['mp4', 'mkv']);
const GENERATED_MEDIA_SUFFIX_REGEX =
  /-(sm|md|lg|poster|preview|stream|hls(?:-init|-(?:high|720p)-init)|subtitles(?:\.[a-z0-9_-]+)?)$/i;
const STALE_REGISTRATION_ERROR_MESSAGE =
  'Previous registration attempt stalled; queued for retry';
const MISSING_UPLOAD_ERROR_PREFIX = 'Upload not found in storage';
const WORKER_BUILD_ID = 'v110';
// A scheduled Worker must finish promptly. Drive copies can become visible
// asynchronously, so persist the in-flight state and check again on the next
// minute instead of polling long enough to lose the registration lease.
export const DRIVE_COPY_VISIBILITY_ATTEMPTS = 3;
export const DRIVE_COPY_VISIBILITY_DELAY_MS = 2000;
export const DRIVE_RETRY_TARGET_VISIBILITY_ATTEMPTS = 3;
export const DRIVE_COPY_REQUEST_TIMEOUT_MS = 15_000;
// A registration scan owns a global lease. Bound every Drive operation in its
// path so one stalled request cannot block all later scans indefinitely.
const REGISTRATION_STORAGE_TIMEOUT_MS = 30_000;
// Keep each inventory request small enough for the Workers free resource
// budget. The database status table is the durable FIFO queue; the storage
// cursor only discovers a bounded slice of new objects on each scan.
export const REGISTRATION_SCAN_PAGE_SIZE = 100;
// Discovery is intentionally isolated from the one-row registration cron.
// A bounded inventory window keeps a direct-upload pass resumable without
// ever delaying a durable registration claim.
// Keep each discovery SQL payload small enough for the Supabase pooler while
// the durable continuation cursor makes large inventories resumable. The
// discovery cron can inspect a larger storage window, but reconciles it in
// 25-object writes so detection throughput improves without touching the
// registration claim/CPU path.
export const REGISTRATION_DISCOVERY_PAGE_SIZE = 100;
export const REGISTRATION_DISCOVERY_SQL_BATCH_SIZE = 25;
// Drive's upload-event endpoint accepts at most 100 rows. Keep the hot lane
// at that ceiling so a burst of direct uploads cannot fall between the recent
// window and the lexicographic cursor after the cursor has passed their keys.
export const REGISTRATION_DISCOVERY_RECENT_PAGE_SIZE = 100;
// Use two alternating schedules so discovery runs once per minute without
// sharing the registration cron. Both schedules execute the same bounded,
// resumable page and never claim or copy a registration.
export const REGISTRATION_DISCOVERY_CRONS = [
  '*/2 * * * *',
  '1-59/2 * * * *',
] as const;
export const REGISTRATION_DISCOVERY_CRON = REGISTRATION_DISCOVERY_CRONS[0];
// A Drive copy can legitimately consume most of a free Worker invocation
// while its destination becomes visible. One attempt per scan keeps the
// lease/retry boundary below the platform execution limit; the DB queue keeps
// the remaining files durable for the next cron tick.
const DELETION_STORAGE_TIMEOUT_MS = 15_000;
const DELETION_MUTATION_TIMEOUT_MS = 45_000;
const DELETION_MUTATION_CONCURRENCY = 4;
const REGISTRATION_MAINTENANCE_TIMEOUT_MS = 10_000;
// Source reconciliation is maintenance only. It must never consume the
// whole scheduled invocation before the durable registration queue runs.
const PROCESSING_SOURCE_RECONCILIATION_TIMEOUT_MS = 5_000;
const PROCESSING_SOURCE_RECONCILIATION_LIMIT = 8;
const PROCESSING_SOURCE_RECONCILIATION_CONCURRENCY = 4;
const REGISTRATION_READY_CHECK_TIMEOUT_MS = 5_000;
const REGISTRATION_READY_CHECK_LIMIT = 8;
// Source cleanup is housekeeping only. Never let a slow Drive delete hold the
// registration lease or block the next FIFO claim.
const REGISTERED_SOURCE_CLEANUP_LIMIT = 4;
// A scheduled invocation can be terminated before finally{} runs. Keep the
// cross-invocation lease short enough that the next cron can recover it.
export const SCAN_LEASE_SECONDS = 90;
// A scheduled invocation must release its execution slot before the durable
// lease expires. This only bounds a hung invocation; it never marks a file
// failed or deletes a source. The registration row remains durable for the
// next stale-claim recovery pass.
export const SCHEDULED_SCAN_DEADLINE_MS =
  Math.max(30_000, SCAN_LEASE_SECONDS * 1000 - 10_000);

const encoder = new TextEncoder();

export const isAllowedStreamDerivativeKey = (key: string) =>
  /^[a-zA-Z0-9._@-]+-stream\.(mp4|webm)$/i.test(key);

export const isAllowedHlsDerivativeKey = (key: string) =>
  /^[a-zA-Z0-9._@-]+-hls(?:-(?:high|720p))?(?:\.m3u8|-init\.mp4|-[0-9]{5}\.m4s)$/i.test(key);

export const isAllowedProcessorUploadKey = (
  key: string,
  photoId: string,
) => isAllowedStreamDerivativeKey(key) ||
  isAllowedHlsDerivativeKey(key) ||
  key.split('/').pop()?.toLowerCase() === `${photoId.toLowerCase()}.mp4`;

type SubtitleManifestTrack = {
  src: string
  lang: string
  label: string
};

type SubtitleUploadMetadata = {
  fileName: string
  lang?: string
  label?: string
};

export const getValidSubtitleUploadMetadata = (
  fileNameBase: string,
  value: unknown,
  uploadedFileNames: string[],
) => {
  if (!Array.isArray(value)) { return [] as Required<SubtitleUploadMetadata>[]; }
  const uploaded = new Set(uploadedFileNames);
  const prefix = `${fileNameBase}-subtitles.`;
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') { return []; }
    const candidate = item as SubtitleUploadMetadata;
    const fileName = candidate.fileName?.trim();
    if (
      !fileName ||
      !uploaded.has(fileName) ||
      !fileName.startsWith(prefix) ||
      !/^[a-z0-9_-]+\.vtt$/i.test(fileName.slice(prefix.length))
    ) {
      return [];
    }
    const token = fileName.slice(prefix.length, -4);
    const lang = (candidate.lang || token || 'und').trim().slice(0, 48);
    const label = (candidate.label || lang.toUpperCase() || 'Subtitle')
      .trim()
      .slice(0, 120);
    return [{ fileName, lang, label }];
  });
};

export const mergeSubtitleManifestTracks = (
  existing: SubtitleManifestTrack[],
  incoming: SubtitleManifestTrack[],
) => {
  const merged = new Map(existing.map(track => [track.src, track]));
  incoming.forEach(track => merged.set(track.src, track));
  return Array.from(merged.values());
};

export const detectStorageProvider = (env: Env) =>
  (
    env.DRIVE_STORAGE_BASE_URL &&
    env.DRIVE_STORAGE_API_KEY &&
    env.DRIVE_STORAGE_PROJECT_ID &&
    env.DRIVE_STORAGE_BUCKET
  )
    ? 'drive' as const
    : 'cloudflare-r2' as const;

const isDriveStorageEnabled = (env: Env) =>
  detectStorageProvider(env) === 'drive';

const driveObjectBaseUrl = (env: Env) =>
  `${env.DRIVE_STORAGE_BASE_URL!.replace(/\/+$/, '')}/${encodeURIComponent(env.DRIVE_STORAGE_BUCKET || '')}`;

const driveApiBaseUrl = (env: Env) => {
  try {
    return new URL(env.DRIVE_STORAGE_BASE_URL || '').origin;
  } catch {
    return '';
  }
};

const revalidateMediaPanel = async (env: Env, photoId?: string) => {
  const baseUrl = env.MEDIA_PANEL_BASE_URL?.trim().replace(/\/+$/, '');
  const secret = (
    env.AUTOMATION_API_SECRET || env.BACKEND_ORCHESTRATOR_SHARED_SECRET
  )?.trim();
  if (!baseUrl || !secret) { return; }

  await fetch(`${baseUrl}/api/processing/revalidate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(photoId ? { photoId } : {}),
    signal: AbortSignal.timeout(REGISTRATION_STORAGE_TIMEOUT_MS),
  }).catch(() => undefined);
};

const driveHeaders = (env: Env, extras?: Record<string, string>) => ({
  Authorization: `Bearer ${env.DRIVE_STORAGE_API_KEY}`,
  'X-Drive-Project': env.DRIVE_STORAGE_PROJECT_ID || '',
  'X-Drive-Bucket': env.DRIVE_STORAGE_BUCKET || '',
  ...(extras ?? {}),
});

const stableStorageReadHeaders = (env: Env) =>
  isDriveStorageEnabled(env) ? driveHeaders(env) : undefined;

const getNumber = (
  value: string | undefined,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) => {
  const parsed = parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) { return fallback; }
  return Math.min(Math.max(parsed, min), max);
};

export const runSafeRegistrationCommit = async ({
  prepareDestination,
  commitRegistration,
  cleanupSource,
  onCleanupError,
}: {
  prepareDestination: () => Promise<void>
  commitRegistration: () => Promise<void>
  cleanupSource: () => Promise<void>
  onCleanupError?: (error: unknown) => void
}) => {
  await prepareDestination();
  await commitRegistration();
  await cleanupSource().catch(error => {
    onCleanupError?.(error);
  });
};

export const isVerifiedStorageCopy = (
  sourceSize: number | undefined,
  destinationSize: number | undefined,
) => destinationSize !== undefined && (
  sourceSize === undefined || sourceSize === destinationSize
);

// Registration commits and ready-destination promotion require both sizes;
// existence alone cannot prove that a Drive copy is complete.
export const isExactVerifiedStorageCopy = (
  sourceSize: number | undefined,
  destinationSize: number | undefined,
) => sourceSize !== undefined &&
  destinationSize !== undefined &&
  sourceSize === destinationSize;

export const isProtectedRegistrationDestination = ({
  objectUrl,
  sourceUrl,
  expectedUrl,
  sourceExists,
}: {
  objectUrl: string
  sourceUrl: string | undefined
  expectedUrl: string | undefined
  sourceExists: boolean
}) => Boolean(
  sourceExists &&
  sourceUrl &&
  expectedUrl &&
  expectedUrl !== sourceUrl &&
  objectUrl === expectedUrl
);

export const shouldVerifyExistingRegistrationDestination = ({
  sourceKey,
  destinationKey,
  mediaId,
  trackedMediaId,
  targetRecordedAsRegistered,
}: {
  sourceKey: string
  destinationKey: string
  mediaId: string
  trackedMediaId: string | undefined
  targetRecordedAsRegistered: boolean
}) => destinationKey !== sourceKey && (
  targetRecordedAsRegistered || trackedMediaId === mediaId
);

export const shouldWaitForTrackedRegistrationDestination = ({
  shouldVerifyExistingTarget,
  registrationStatus,
  targetAlreadyRegistered,
  retryStale = false,
}: {
  shouldVerifyExistingTarget: boolean
  registrationStatus: string | undefined
  targetAlreadyRegistered: boolean
  retryStale?: boolean
}) => shouldVerifyExistingTarget &&
  registrationStatus === 'registering' &&
  !targetAlreadyRegistered &&
  !retryStale;

export const waitForVerifiedStorageCopy = async ({
  sourceSize,
  readDestinationSize,
  attempts = 1,
  delayMs = 0,
  wait = sleep,
}: {
  sourceSize: number | undefined
  readDestinationSize: () => Promise<number | undefined>
  attempts?: number
  delayMs?: number
  wait?: (milliseconds: number) => Promise<void>
}) => {
  let destinationSize: number | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    destinationSize = await readDestinationSize();
    if (isVerifiedStorageCopy(sourceSize, destinationSize)) {
      return destinationSize;
    }
    if (attempt < attempts - 1 && delayMs > 0) {
      await wait(delayMs);
    }
  }
  return destinationSize;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

type WorkerLandingMetadata = {
  title: string
  kicker: string
  description: string
  ownerName?: string
  repoName?: string
  repoUrl?: string
  panelUrl?: string
  githubUrl?: string
  portfolioUrl?: string
};

const DEFAULT_LANDING_METADATA: WorkerLandingMetadata = {
  title: 'Media Panel',
  kicker: 'Personal media library',
  description: 'A quiet, focused space to organize and view your collection.',
};

let landingMetadataCache: {
  expiresAt: number
  metadata: WorkerLandingMetadata
} | undefined;

const safeLandingUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) { return undefined; }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const isGitHubRepositoryUrl = (value?: string) => {
  if (!value) { return false; }
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === 'github.com' &&
      url.pathname.split('/').filter(Boolean).length >= 2;
  } catch {
    return false;
  }
};

const escapeLandingHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getWorkerLandingMetadata = async (env: Env) => {
  if (landingMetadataCache && landingMetadataCache.expiresAt > Date.now()) {
    return landingMetadataCache.metadata;
  }
  const baseUrl = env.MEDIA_PANEL_BASE_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) { return DEFAULT_LANDING_METADATA; }
  const configuredPanelUrl = safeLandingUrl(baseUrl);
  try {
    const response = await fetch(`${baseUrl}/api/site-info`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) { throw new Error(`Panel metadata returned ${response.status}`); }
    const value = await response.json() as Partial<WorkerLandingMetadata>;
    const configuredRepoUrl = safeLandingUrl(value.repoUrl);
    const configuredGithubUrl = safeLandingUrl(value.githubUrl);
    // Older panel deployments exposed the repository as repoUrl and a GitHub
    // profile as githubUrl. Normalize both shapes so the buttons never point
    // at the wrong destination while the panel deployment rolls forward.
    const githubUrl = isGitHubRepositoryUrl(configuredGithubUrl)
      ? configuredGithubUrl
      : isGitHubRepositoryUrl(configuredRepoUrl)
        ? configuredRepoUrl
        : configuredGithubUrl;
    const panelUrl = configuredPanelUrl || (
      configuredRepoUrl && !isGitHubRepositoryUrl(configuredRepoUrl)
        ? configuredRepoUrl
        : undefined
    );
    const metadata: WorkerLandingMetadata = {
      title: typeof value.title === 'string' && value.title.trim()
        ? value.title.trim()
        : DEFAULT_LANDING_METADATA.title,
      kicker: typeof value.kicker === 'string' && value.kicker.trim()
        ? value.kicker.trim()
        : DEFAULT_LANDING_METADATA.kicker,
      description: typeof value.description === 'string' && value.description.trim()
        ? value.description.trim()
        : DEFAULT_LANDING_METADATA.description,
      ownerName: typeof value.ownerName === 'string' && value.ownerName.trim()
        ? value.ownerName.trim()
        : undefined,
      repoName: typeof value.repoName === 'string' ? value.repoName.trim() : undefined,
      repoUrl: configuredRepoUrl,
      panelUrl,
      githubUrl,
      portfolioUrl: safeLandingUrl(value.portfolioUrl),
    };
    landingMetadataCache = { expiresAt: Date.now() + 60_000, metadata };
    return metadata;
  } catch (error) {
    console.warn('Unable to load panel landing metadata; using defaults', error);
    return DEFAULT_LANDING_METADATA;
  }
};

const workerLandingPage = (metadata: WorkerLandingMetadata) => {
  const title = escapeLandingHtml(metadata.title);
  const kicker = escapeLandingHtml(metadata.kicker);
  const description = escapeLandingHtml(metadata.description);
  const configuredOwner = metadata.ownerName || (() => {
    for (const value of [metadata.githubUrl, metadata.repoUrl]) {
      if (!value) { continue; }
      try {
        const segment = new URL(value).pathname.split('/').filter(Boolean)[0];
        if (segment) { return segment; }
      } catch {
        // The metadata URL has already been validated; keep the fallback safe.
      }
    }
    return '';
  })();
  const ownerName = escapeLandingHtml(configuredOwner);
  const links = [
    metadata.githubUrl && `<a href="${escapeLandingHtml(metadata.githubUrl)}" rel="noopener noreferrer">GitHub <span class="arrow">-&gt;</span></a>`,
    metadata.panelUrl && `<a href="${escapeLandingHtml(metadata.panelUrl)}" rel="noopener noreferrer">Media Panel <span class="arrow">-&gt;</span></a>`,
    metadata.portfolioUrl && `<a href="${escapeLandingHtml(metadata.portfolioUrl)}" rel="noopener noreferrer">Portfolio <span class="arrow">-&gt;</span></a>`,
  ].filter(Boolean).join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${title}</title>
    <style>
      :root{color-scheme:light;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;background:#f7f7f7;color:#171717;--page:#f7f7f7;--surface:#fff;--line:#d9d9d9;--muted:#707070;--hover:#f0f0f0}
      @media(prefers-color-scheme:dark){:root{color-scheme:dark;background:#090909;color:#ededed;--page:#090909;--surface:#111;--line:#303030;--muted:#9a9a9a;--hover:#1d1d1d}}
      *{box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{margin:0;min-height:100dvh;height:100dvh;display:grid;place-items:center;background:var(--page);padding:18px}
      main{width:min(620px,100%);border:1px solid var(--line);border-radius:10px;background:var(--surface);box-shadow:0 10px 30px rgba(0,0,0,.06);overflow:hidden}
      .top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid var(--line);font-size:12px;letter-spacing:.08em;text-transform:uppercase}.brand{display:flex;align-items:center;gap:9px}.mark{width:9px;height:9px;border-radius:2px;background:currentColor}.account{color:var(--muted);font-size:11px;letter-spacing:0;text-transform:none}
      .content{padding:clamp(30px,7vw,58px) clamp(24px,7vw,64px) 34px}.kicker{margin:0 0 19px;color:var(--muted);font-size:11px;letter-spacing:.12em;text-transform:uppercase}h1{max-width:480px;margin:0;font-size:clamp(29px,6vw,46px);font-weight:500;line-height:1.1;letter-spacing:-.055em}p{max-width:480px;margin:18px 0 0;color:var(--muted);font-size:14px;line-height:1.75}.rule{height:1px;margin:34px 0 22px;background:var(--line)}.links{display:flex;flex-wrap:wrap;gap:9px}.links a{display:inline-flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;color:inherit;text-decoration:none;font-size:12px;transition:background-color .16s ease,border-color .16s ease}.links a:hover{background:var(--hover);border-color:var(--muted)}.arrow{color:var(--muted);font-size:14px}.footer{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
      @media(max-width:520px){body{padding:10px}.content{padding:30px 22px 28px}.links{display:grid}.links a{width:100%;justify-content:space-between}}
    </style>
  </head>
  <body>
    <main>
      <header class="top"><div class="brand"><span class="mark"></span><span>${title}</span></div><span class="account">${ownerName}</span></header>
      <section class="content">
        <p class="kicker">${kicker}</p>
        <h1>${title}</h1>
        <p>${description}</p>
        <div class="rule"></div>
        <nav class="links" aria-label="External links">${links}</nav>
      </section>
      <footer class="footer">Powered by ${ownerName || title}</footer>
    </main>
  </body>
</html>`;
};

const landingResponse = (
  request: Request,
  metadata: WorkerLandingMetadata,
) => new Response(
  request.method === 'HEAD' ? null : workerLandingPage(metadata),
  {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
);

const isAuthorized = (
  request: Request,
  secret: string | undefined,
) => {
  if (!secret) { return true; }
  const authorization = request.headers.get('authorization') || '';
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token === secret;
};

const deriveTitleFromFileName = (fileName?: string) =>
  fileName
    ?.replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toNaivePostgresString = (value: string) =>
  value.replace(
    /(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/,
    '$1 $2',
  );

const parseDateValue = (value?: string | Date | null) => {
  if (!value) { return undefined; }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
};

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

const getFileParts = (key: string) => {
  const normalized = key.split('?')[0] || '';
  const fileName = normalized.split('/').pop() || normalized;
  const lastDot = fileName.lastIndexOf('.');
  const fileNameBase = lastDot >= 0
    ? fileName.slice(0, lastDot)
    : fileName;
  const extension = lastDot >= 0
    ? fileName.slice(lastDot + 1).toLowerCase()
    : '';
  return {
    fileName,
    fileNameBase,
    extension,
  };
};

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const canonicalizeStorageUrl = (url: string) => {
  const [withoutQuery] = url.split('?');
  try {
    const parsed = new URL(withoutQuery);
    const normalizedPath = parsed.pathname
      .split('/')
      .map(segment => encodeURIComponent(safeDecodeURIComponent(segment)))
      .join('/');
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return withoutQuery;
  }
};

const decodeStorageUrlPath = (url: string) => {
  const [withoutQuery] = url.split('?');
  try {
    const parsed = new URL(withoutQuery);
    const decodedPath = parsed.pathname
      .split('/')
      .map(segment => safeDecodeURIComponent(segment))
      .join('/');
    return `${parsed.origin}${decodedPath}`;
  } catch {
    return withoutQuery;
  }
};

const urlForKey = (env: Env, key: string) =>
  isDriveStorageEnabled(env)
    ? `${driveObjectBaseUrl(env)}/${key.split('/').map(encodeURIComponent).join('/')}`
    : `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`;

const keyFromStorageUrl = (env: Env, url: string) => {
  const [urlWithoutQuery] = url.split('?');
  const base = isDriveStorageEnabled(env)
    ? driveObjectBaseUrl(env)
    : env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  if (!base || !urlWithoutQuery.startsWith(base)) {
    return '';
  }
  return urlWithoutQuery.slice(base.length).replace(/^\/+/, '').split('/').map(decodeURIComponent).join('/');
};

const listDriveKeysForPrefix = async (
  env: Env,
  prefix: string,
  timeoutMs = DELETION_STORAGE_TIMEOUT_MS,
) => {
  const listUrl = new URL(`${driveApiBaseUrl(env)}/api/v1/storage/list`);
  listUrl.searchParams.set('projectId', env.DRIVE_STORAGE_PROJECT_ID || '');
  listUrl.searchParams.set('bucket', env.DRIVE_STORAGE_BUCKET || '');
  listUrl.searchParams.set('prefix', prefix);
  listUrl.searchParams.set('limit', '10000');
  const response = await fetch(listUrl.toString(), {
    headers: driveHeaders(env),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Drive deletion list failed (${response.status})`);
  }
  const data = await response.json() as {
    objects?: Array<{ key?: string, fileName?: string, url?: string }>
  };
  return (data.objects || []).flatMap(item => {
    const itemKey = item.key || item.fileName ||
      (item.url ? keyFromStorageUrl(env, item.url) : '');
    return itemKey ? [itemKey] : [];
  });
};

const listDriveObjectSize = async (
  env: Env,
  key: string,
  timeoutMs = REGISTRATION_STORAGE_TIMEOUT_MS,
) => {
  const listUrl = new URL(`${driveApiBaseUrl(env)}/api/v1/storage/list`);
  listUrl.searchParams.set('projectId', env.DRIVE_STORAGE_PROJECT_ID || '');
  listUrl.searchParams.set('bucket', env.DRIVE_STORAGE_BUCKET || '');
  listUrl.searchParams.set('prefix', key);
  listUrl.searchParams.set('limit', '10');
  const response = await fetch(listUrl.toString(), {
    headers: driveHeaders(env),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return undefined;
  const data = await response.json() as {
    objects?: Array<{ key?: string, fileName?: string, url?: string, size?: number | string }>
  };
  const object = (data.objects || []).find(item => {
    const itemKey = item.key || item.fileName ||
      (item.url ? keyFromStorageUrl(env, item.url) : '');
    return itemKey === key;
  });
  const size = Number(object?.size);
  return Number.isFinite(size) && size >= 0 ? size : undefined;
};

const driveObjectExists = async (
  env: Env,
  key: string,
  timeoutMs?: number,
) => {
  const effectiveTimeoutMs = timeoutMs ?? REGISTRATION_STORAGE_TIMEOUT_MS;
  const response = await fetch(
    `${driveApiBaseUrl(env)}/api/v1/storage/object/${key.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'HEAD',
      headers: driveHeaders(env),
      signal: AbortSignal.timeout(effectiveTimeoutMs),
    },
  );
  if (response.status === 404) { return false; }
  if (response.status === 405 || response.status === 501) {
    const keys = await listDriveKeysForPrefix(env, key, effectiveTimeoutMs);
    return keys.includes(key);
  }
  if (!response.ok) {
    throw new Error(`Drive source check failed (${response.status})`);
  }
  return true;
};

const storageObjectSize = async (
  env: Env,
  key: string,
  timeoutMs = REGISTRATION_STORAGE_TIMEOUT_MS,
) => {
  if (isDriveStorageEnabled(env)) {
    const response = await fetch(
      `${driveApiBaseUrl(env)}/api/v1/storage/object/${key.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'HEAD',
        headers: driveHeaders(env),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) { return undefined; }
    const contentLength = response.headers.get('content-length');
    if (contentLength === null) {
      return listDriveObjectSize(env, key, timeoutMs).catch(() => undefined);
    }
    const size = Number(contentLength);
    return Number.isFinite(size) && size >= 0 ? size : undefined;
  }

  try {
    const response = await r2Request(env, 'HEAD', key);
    const contentLength = response.headers.get('content-length');
    if (contentLength === null) { return undefined; }
    const size = Number(contentLength);
    return Number.isFinite(size) && size >= 0 ? size : undefined;
  } catch {
    return undefined;
  }
};

const finalizeDriveUpload = async (env: Env, key: string) => {
  const response = await fetch(
    `${driveApiBaseUrl(env)}/api/v1/storage/finalize`,
    {
      method: 'POST',
      headers: driveHeaders(env, {
        'Content-Type': 'application/json',
      }),
      signal: AbortSignal.timeout(REGISTRATION_STORAGE_TIMEOUT_MS),
      body: JSON.stringify({
        projectId: env.DRIVE_STORAGE_PROJECT_ID,
        bucket: env.DRIVE_STORAGE_BUCKET,
        key,
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Drive finalize failed (${response.status})${text ? `: ${text}` : ''}`,
    );
  }
};

const storageObjectExists = async (
  env: Env,
  key: string,
  timeoutMs?: number,
) => {
  if (isDriveStorageEnabled(env)) {
    return driveObjectExists(env, key, timeoutMs);
  }

  try {
    await r2Request(env, 'HEAD', key, {
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    return true;
  } catch (error) {
    if (/R2 request failed \(404\b/i.test(String(error))) { return false; }
    throw error;
  }
};

const createDriveSignedDownloadUrl = async (env: Env, key: string) => {
  const downloadUrl = new URL(`${driveApiBaseUrl(env)}/api/v1/files/download`);
  downloadUrl.searchParams.set('projectId', env.DRIVE_STORAGE_PROJECT_ID || '');
  downloadUrl.searchParams.set('bucket', env.DRIVE_STORAGE_BUCKET || '');
  downloadUrl.searchParams.set('key', key);
  downloadUrl.searchParams.set('expiresInSeconds', '900');
  const response = await fetch(downloadUrl.toString(), {
    headers: driveHeaders(env),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Drive download sign failed (${response.status})${text ? `: ${text}` : ''}`);
  }
  const data = await response.json() as { url?: string };
  if (!data.url) {
    throw new Error('Drive download sign failed: missing signed URL');
  }
  return data.url;
};

const areUniqueMediaNamesEnabled = (env: Env) =>
  env.UNIQUE_MEDIA_NAMES !== undefined
    ? env.UNIQUE_MEDIA_NAMES !== '0'
    : env.NEXT_PUBLIC_UNIQUE_MEDIA_NAMES !== '0';

const GENERATED_MEDIA_ID_PATTERN = /^\d{12}$/;

const trimToUndefined = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const isDriveTimeoutLikeError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : String(error ?? '');
  return (
    message.includes('(524)') ||
    /timeout/i.test(message) ||
    /timed out/i.test(message)
  );
};

export const isRecoverableDriveCopyError = (error: unknown) => {
  if (isDriveTimeoutLikeError(error)) { return true; }
  const message = error instanceof Error
    ? error.message
    : String(error ?? '');
  return (
    /^Drive copy failed \(5\d{2}\)/i.test(message) ||
    message.startsWith('Drive copy not ready:') ||
    message.startsWith('Copied destination is not readable in storage:') ||
    message.startsWith('Copied destination size mismatch:')
  );
};

export const selectOldestRegistrationBatch = (
  pending: R2ObjectLike[],
  attemptedKeys: Set<string>,
  limit: number,
  deferredKeys: Set<string> = new Set(),
) => pending
  .filter(object =>
    !attemptedKeys.has(object.key) && !deferredKeys.has(object.key))
  .sort((left, right) => {
    const leftUploaded = left.uploaded?.getTime();
    const rightUploaded = right.uploaded?.getTime();
    const leftTime = Number.isFinite(leftUploaded)
      ? leftUploaded as number
      : Number.MAX_SAFE_INTEGER;
    const rightTime = Number.isFinite(rightUploaded)
      ? rightUploaded as number
      : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.key.localeCompare(right.key);
  })
  .slice(0, Math.max(0, limit));

const isGeneratedMediaName = (fileName?: string | null) => {
  const normalized = trimToUndefined(fileName);
  return Boolean(
    normalized &&
    GENERATED_MEDIA_ID_PATTERN.test(getFileParts(normalized).fileNameBase),
  );
};

const getOriginalFileNameFromSourceUrl = (
  statusRow?: RegistrationStatusRow,
) => {
  const sourceUrl = trimToUndefined(statusRow?.source_url);
  if (!sourceUrl) { return undefined; }
  const sourceFileName = trimToUndefined(getFileParts(sourceUrl).fileName);
  if (!sourceFileName || isGeneratedMediaName(sourceFileName)) {
    return undefined;
  }
  return sourceFileName;
};

const resolveRegistrationSourceUrl = (
  statusRow: RegistrationStatusRow | undefined,
  fallbackUrl: string,
) => trimToUndefined(statusRow?.source_url) || fallbackUrl;

const resolveRegistrationOriginalFileName = ({
  hint,
  statusRow,
  fallbackFileName,
}: {
  hint?: UploadRegistrationHintRow
  statusRow?: RegistrationStatusRow
  fallbackFileName?: string
}) => {
  const hintFileName = trimToUndefined(hint?.original_file_name);
  if (hintFileName) { return hintFileName; }

  const statusOriginalFileName = trimToUndefined(statusRow?.original_file_name);
  if (statusOriginalFileName && !isGeneratedMediaName(statusOriginalFileName)) {
    return statusOriginalFileName;
  }

  const statusFileName = trimToUndefined(statusRow?.file_name);
  if (statusFileName && !isGeneratedMediaName(statusFileName)) {
    return statusFileName;
  }

  const sourceFileName = getOriginalFileNameFromSourceUrl(statusRow);
  if (sourceFileName) { return sourceFileName; }

  return trimToUndefined(fallbackFileName) || fallbackFileName;
};

const resolveRegistrationTitle = ({
  originalFileName,
  fallbackFileName,
}: {
  originalFileName?: string
  fallbackFileName?: string
}) => {
  return (
    deriveTitleFromFileName(trimToUndefined(originalFileName)) ||
    deriveTitleFromFileName(trimToUndefined(fallbackFileName)) ||
    deriveTitleFromFileName(fallbackFileName)
  );
};

type SqlQuery = (...parts: any[]) => Promise<unknown[]>;
const SUPABASE_CONNECT_TIMEOUT_MS = 10_000;
const SUPABASE_QUERY_TIMEOUT_MS = 20_000;
const SUPABASE_CONNECTION_RETRY_ATTEMPTS = 3;
const getRegistrationScanBudgetMs = (env: Env) => {
  const deadline = Number(env.REGISTRATION_SCAN_DEADLINE_AT);
  if (!Number.isFinite(deadline)) { return Number.POSITIVE_INFINITY; }
  return Math.max(0, deadline - Date.now());
};
const connectionStringWithoutSslMode = (value: string) => {
  try {
    const url = new URL(value);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return value;
  }
};
const isRetryableSupabaseConnectionError = (error: unknown) =>
  /connection terminated unexpectedly|connection reset|econnreset|socket closed/i
    .test(error instanceof Error ? error.message : String(error));
const isSupabasePostgresUrl = (value: string) => {
  try {
    const hostname = new URL(value).hostname;
    return /(?:^|\.)supabase\.co$/i.test(hostname) ||
      /\.pooler\.supabase\.com$/i.test(hostname);
  } catch {
    return false;
  }
};
const shouldDisablePostgresSsl = (env: Env) => {
  const explicit = env.DISABLE_POSTGRES_SSL?.trim();
  if (explicit === '1') { return true; }
  if (explicit === '0') { return false; }
  return isSupabasePostgresUrl(env.POSTGRES_URL);
};
const describePostgresQuery = (text: string) => text
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 240);

const supabaseSqlForEnv = (env: Env): SqlQuery => {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] || '';
    for (let index = 1; index < strings.length; index += 1) {
      text += `$${index}${strings[index] || ''}`;
    }
    for (let attempt = 0; attempt < SUPABASE_CONNECTION_RETRY_ATTEMPTS; attempt += 1) {
      const scanBudgetMs = getRegistrationScanBudgetMs(env);
      if (scanBudgetMs <= 0) {
        throw new Error('Registration scan safety window elapsed before Postgres query');
      }
      const connectionTimeoutMs = Math.max(
        250,
        Math.min(SUPABASE_CONNECT_TIMEOUT_MS, scanBudgetMs),
      );
      const queryTimeoutMs = Math.max(
        250,
        Math.min(SUPABASE_QUERY_TIMEOUT_MS, scanBudgetMs),
      );
      // Workers are stateless. Do not retain a pg Client or Pool between
      // events: the runtime may reclaim the socket after a prior invocation.
      const client = new Client({
        connectionString: connectionStringWithoutSslMode(env.POSTGRES_URL),
        ssl: shouldDisablePostgresSsl(env)
          ? false
          : { rejectUnauthorized: false },
        connectionTimeoutMillis: connectionTimeoutMs,
        query_timeout: queryTimeoutMs,
        statement_timeout: queryTimeoutMs,
      });
      try {
        await client.connect();
        const result = await client.query({
          text,
          values,
          query_timeout: queryTimeoutMs,
          statement_timeout: queryTimeoutMs,
        });
        return result.rows;
      } catch (error) {
        if (
          attempt < SUPABASE_CONNECTION_RETRY_ATTEMPTS - 1 &&
          getRegistrationScanBudgetMs(env) > 500 &&
          isRetryableSupabaseConnectionError(error)
        ) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Postgres query failed after ${attempt + 1} attempt(s): ` +
          `${describePostgresQuery(text)}; ${message}`,
          { cause: error },
        );
      } finally {
        // A terminated Supabase socket can leave pg Client.end() waiting on
        // the transport forever even after the query timeout has fired. Do
        // not let cleanup hold the scan lease or the scheduled invocation;
        // the Worker isolate can reclaim any late socket close safely.
        const closeClient = async () => {
          await client.end().catch(() => undefined);
        };
        await Promise.race([closeClient(), sleep(1_000)]);
      }
    }
    return [];
  };
  return sql as SqlQuery;
};

const sqlForEnv = (env: Env) =>
  isSupabasePostgresUrl(env.POSTGRES_URL)
    ? supabaseSqlForEnv(env)
    : neon(env.POSTGRES_URL);

type BackendActivity = {
  category: 'orchestrator' | 'registration' | 'processing' | 'processor'
  event: string
  status?: 'info' | 'success' | 'warning' | 'error'
  message: string
  mediaId?: string
  processorId?: string
  details?: Record<string, unknown>
};

let backendActivityLogTableReady: Promise<void> | undefined;
const ensureBackendActivityLogTable = async (env: Env) => {
  if (!backendActivityLogTableReady) {
    const sql = sqlForEnv(env);
    backendActivityLogTableReady = sql`
      CREATE TABLE IF NOT EXISTS backend_activity_log (
        id BIGSERIAL PRIMARY KEY,
        category VARCHAR(32) NOT NULL,
        event VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        media_id TEXT,
        processor_id TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `.then(() => undefined);
  }
  try {
    await backendActivityLogTableReady;
  } catch (error) {
    backendActivityLogTableReady = undefined;
    throw error;
  }
};

const logBackendActivity = async (
  env: Env,
  activity: BackendActivity,
) => {
  // The Free Workers CPU budget is only 10 ms per cron invocation. Opening a
  // fresh Postgres client for every observability event can exhaust that tiny
  // budget before registration starts. Even console serialization is costly
  // on a cold scheduled isolate, so keep the cron hot path to actionable
  // events. Successful completions and warnings/errors remain visible in
  // Cloudflare Logs; routine trigger chatter is omitted. Keep tiny phase
  // markers so an exceeded-CPU invocation still identifies whether it died
  // before ID allocation or during copy/commit.
  if (env.REGISTRATION_SCHEDULED === '1') {
    const status = activity.status || 'info';
    const keepPhaseMarker = activity.event === 'registration_claimed' ||
      activity.event === 'registration_id_allocated' ||
      activity.event === 'registration_commit_started';
    if (status === 'info' && !keepPhaseMarker) {
      return;
    }
    console.log(JSON.stringify({
      category: activity.category,
      event: activity.event,
      status,
      message: activity.message,
      mediaId: activity.mediaId,
      processorId: activity.processorId,
      details: activity.details,
    }));
    return;
  }
  try {
    await ensureBackendActivityLogTable(env);
    const sql = sqlForEnv(env);
    await sql`
      INSERT INTO backend_activity_log (
        category, event, status, message, media_id, processor_id, details
      ) VALUES (
        ${activity.category},
        ${activity.event},
        ${activity.status || 'info'},
        ${activity.message},
        ${activity.mediaId ?? null},
        ${activity.processorId ?? null},
        ${JSON.stringify(activity.details || {})}::jsonb
      )
    `;
  } catch (error) {
    console.warn('Unable to record backend activity', error);
  }
};

const getBackendActivityLogs = async (env: Env, limit: number) => {
  await ensureBackendActivityLogTable(env);
  const sql = sqlForEnv(env);
  const retentionDays = getNumber(env.REGISTRATION_HISTORY_DAYS, 14, {
    min: 1,
    max: 365,
  });
  await sql`
    DELETE FROM backend_activity_log
    WHERE created_at < now() - (${String(retentionDays)} || ' days')::interval
  `;
  return await sql`
    SELECT
      id, category, event, status, message, media_id, processor_id,
      details, created_at
    FROM backend_activity_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as unknown as Record<string, unknown>[];
};

export const stableMediaIdForUrl = async (
  url: string,
  uploaded?: Date,
  attempt = 0,
) => {
  const baseIdentity = uploaded
    ? `${decodeURIComponent(url).split('?')[0]}|${uploaded.toISOString()}`
    : decodeURIComponent(url).split('?')[0];
  const objectIdentity = attempt > 0
    ? `${baseIdentity}|collision-${attempt}`
    : baseIdentity;
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(objectIdentity),
  );
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return (
    BigInt(`0x${hashHex.slice(0, 16)}`) % BigInt('1000000000000')
  ).toString().padStart(12, '0');
};

const mediaIdForObject = async (
  env: Env,
  key: string,
  uploaded?: Date,
  attempt = 0,
) => {
  const { fileNameBase } = getFileParts(key);
  if (
    attempt === 0 &&
    areUniqueMediaNamesEnabled(env) &&
    GENERATED_MEDIA_ID_PATTERN.test(fileNameBase)
  ) {
    return fileNameBase;
  }
  return stableMediaIdForUrl(urlForKey(env, key), uploaded, attempt);
};

export const findAvailableMediaId = async (
  candidateForAttempt: (attempt: number) => Promise<string>,
  occupiedIds: Set<string>,
) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = await candidateForAttempt(attempt);
    if (!occupiedIds.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('Unable to allocate a unique media ID');
};

export const isDeferredSourceCleanupSafe = (
  sourceUploaded?: Date,
  mapUpdatedAt?: Date,
) => Boolean(
  sourceUploaded &&
  mapUpdatedAt &&
  sourceUploaded.getTime() <= mapUpdatedAt.getTime()
);

const sha256Hex = async (input: string | Uint8Array | ArrayBuffer) => {
  const bytes =
    typeof input === 'string'
      ? encoder.encode(input)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : input;
  const hash = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const encodeR2PathSegment = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, ch =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

const canonicalUriForKey = (key = '') =>
  `/${key.split('/').map(encodeR2PathSegment).join('/')}`;

const r2Host = (env: Env) => `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const getR2Client = (env: Env) =>
  new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&');

const r2Request = async (
  env: Env,
  method: string,
  key = '',
  {
    query = new URLSearchParams(),
    body,
    headers = {},
    signal,
  }: {
    query?: URLSearchParams
    body?: BodyInit | null
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {},
) => {
  const host = r2Host(env);
  const queryString = query.toString();
  const url =
    `https://${host}/${env.R2_BUCKET}${canonicalUriForKey(key)}` +
    (queryString ? `?${queryString}` : '');
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('x-amz-content-sha256')) {
    requestHeaders.set(
      'x-amz-content-sha256',
      body == null
        ? await sha256Hex('')
        : body instanceof ArrayBuffer
          ? await sha256Hex(body)
          : body instanceof Uint8Array
            ? await sha256Hex(body)
            : await sha256Hex(await new Response(body).arrayBuffer()),
    );
  }
  const response = await getR2Client(env).fetch(url, {
    method,
    headers: requestHeaders,
    body,
    signal,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `R2 request failed (${response.status} ${response.statusText})` +
      (errorText ? `: ${errorText}` : ''),
    );
  }
  return response;
};

const listStoragePage = async (
  env: Env,
  continuationToken?: string,
  pageSize = REGISTRATION_SCAN_PAGE_SIZE,
): Promise<StorageListPage> => {
  if (isDriveStorageEnabled(env)) {
    const listUrl = new URL(`${driveApiBaseUrl(env)}/api/v1/storage/list`);
    listUrl.searchParams.set('projectId', env.DRIVE_STORAGE_PROJECT_ID || '');
    listUrl.searchParams.set('bucket', env.DRIVE_STORAGE_BUCKET || '');
    listUrl.searchParams.set('paged', '1');
    listUrl.searchParams.set('limit', String(pageSize));
    if (continuationToken) {
      listUrl.searchParams.set('continuationToken', continuationToken);
    }
    const response = await fetch(listUrl.toString(), {
      headers: driveHeaders(env),
      signal: AbortSignal.timeout(REGISTRATION_STORAGE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Drive list failed (${response.status})`);
    }
    const data = await response.json() as {
      objects?: Array<{ key: string, uploadedAt?: string | null, size?: number }>
      nextContinuationToken?: string | null
    };
    return {
      objects: (data.objects || []).map(object => ({
        key: object.key,
        uploaded: object.uploadedAt ? new Date(object.uploadedAt) : undefined,
        size: typeof object.size === 'number' ? object.size : undefined,
      })),
      nextContinuationToken: trimToUndefined(data.nextContinuationToken),
    };
  }

  const query = new URLSearchParams({
    'list-type': '2',
    'max-keys': String(pageSize),
  });
  if (continuationToken) {
    query.set('continuation-token', continuationToken);
  }

  const response = await r2Request(env, 'GET', '', {
    query,
    signal: AbortSignal.timeout(REGISTRATION_STORAGE_TIMEOUT_MS),
  });
  const xml = await response.text();
  const objects: R2ObjectLike[] = [];
  const contents = Array.from<RegExpMatchArray>(
    xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g),
  );
  contents.forEach(match => {
    const content = match[1] || '';
    const keyMatch = content.match(/<Key>([\s\S]*?)<\/Key>/);
    if (!keyMatch?.[1]) { return; }
    const lastModifiedMatch =
      content.match(/<LastModified>([\s\S]*?)<\/LastModified>/);
    const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
    objects.push({
      key: decodeXmlEntities(keyMatch[1]),
      uploaded: lastModifiedMatch?.[1]
        ? new Date(lastModifiedMatch[1])
        : undefined,
      size: sizeMatch?.[1] ? Number(sizeMatch[1]) : undefined,
    });
  });

  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextTokenMatch =
    xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
  return {
    objects,
    nextContinuationToken: isTruncated && nextTokenMatch?.[1]
      ? decodeXmlEntities(nextTokenMatch[1])
      : undefined,
  };
};

const listRecentStoragePage = async (
  env: Env,
  pageSize = REGISTRATION_DISCOVERY_PAGE_SIZE,
): Promise<StorageListPage> => {
  if (!isDriveStorageEnabled(env)) {
    return { objects: [] };
  }
  const listUrl = new URL(`${driveApiBaseUrl(env)}/api/v1/storage/recent`);
  listUrl.searchParams.set('projectId', env.DRIVE_STORAGE_PROJECT_ID || '');
  listUrl.searchParams.set('bucket', env.DRIVE_STORAGE_BUCKET || '');
  listUrl.searchParams.set('limit', String(Math.min(pageSize, 100)));
  const response = await fetch(listUrl.toString(), {
    headers: driveHeaders(env),
    signal: AbortSignal.timeout(REGISTRATION_STORAGE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Drive recent list failed (${response.status})`);
  }
  const data = await response.json() as {
    objects?: Array<{ key: string, uploadedAt?: string | null, size?: number }>
  };
  return {
    objects: (data.objects || []).map(object => ({
      key: object.key,
      uploaded: object.uploadedAt ? new Date(object.uploadedAt) : undefined,
      size: typeof object.size === 'number' ? object.size : undefined,
    })),
  };
};

const putObject = async (
  env: Env,
  key: string,
  value: ArrayBuffer,
  contentType: string,
) => {
  if (isDriveStorageEnabled(env)) {
    const response = await fetch(
      `${driveApiBaseUrl(env)}/api/v1/storage/object/${key.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'PUT',
        headers: driveHeaders(env, {
          'Content-Type': contentType,
        }),
        body: value,
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Drive put failed (${response.status})${text ? `: ${text}` : ''}`);
    }
    return;
  }
  await r2Request(env, 'PUT', key, {
    body: value,
    headers: {
      'content-type': contentType,
    },
  });
};

const deleteObject = async (
  env: Env,
  key: string,
) => {
  if (isDriveStorageEnabled(env)) {
    const response = await fetch(
      `${driveApiBaseUrl(env)}/api/v1/storage/object/${key.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'DELETE',
        // A media deletion is an explicit, authenticated destructive action.
        // Ask Drive to clear stale object-operation locks after the object is
        // deleted so an abandoned lock cannot permanently block cleanup.
        headers: driveHeaders(env, {
          'X-Drive-Force-Delete': 'true',
        }),
        signal: AbortSignal.timeout(DELETION_MUTATION_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      if (response.status === 404) { return; }
      const text = await response.text().catch(() => '');
      throw new Error(`Drive delete failed (${response.status})${text ? `: ${text}` : ''}`);
    }
    return;
  }
  await r2Request(env, 'DELETE', key, {
    signal: AbortSignal.timeout(DELETION_MUTATION_TIMEOUT_MS),
  });
};

export const deleteStorageKeyIfPresent = async ({
  exists,
  remove,
}: {
  exists: () => Promise<boolean>
  remove: () => Promise<void>
}) => {
  if (!await exists()) { return 'already-missing' as const; }
  try {
    await remove();
    return 'deleted' as const;
  } catch (error) {
    if (!await exists()) { return 'already-missing' as const; }
    throw error;
  }
};

type MediaDeletionQueueRow = {
  media_id: string
  title?: string | null
  urls?: unknown
  prefixes?: unknown
  attempts?: number
};

let mediaDeletionQueueTableReady: Promise<void> | undefined;
const ensureMediaDeletionQueueTable = async (env: Env) => {
  if (env.REGISTRATION_SCHEDULED === '1') return;
  if (!mediaDeletionQueueTableReady) {
    const sql = sqlForEnv(env);
    mediaDeletionQueueTableReady = sql`
      CREATE TABLE IF NOT EXISTS media_deletion_queue (
        media_id TEXT PRIMARY KEY,
        title TEXT,
        urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        prefixes JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        claimed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `.then(() => undefined);
  }
  try {
    await mediaDeletionQueueTableReady;
  } catch (error) {
    mediaDeletionQueueTableReady = undefined;
    throw error;
  }
};

const stringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      return stringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
};

export const deletionKeyMatchesPrefix = (key: string, prefix: string) => {
  if (prefix.includes('/')) {
    const keyWithoutExtension = key.replace(/\.[^/.]+$/, '');
    return keyWithoutExtension === prefix ||
      keyWithoutExtension.startsWith(`${prefix}-`);
  }
  const { fileNameBase } = getFileParts(key);
  return fileNameBase === prefix || fileNameBase.startsWith(`${prefix}-`);
};

const deletionPrefixForKey = (key: string) => key.replace(/\.[^/.]+$/, '');

export const buildDeletionPrefixes = (
  mediaId: string,
  queuedPrefixes: string[],
  explicitKeys: string[],
) => {
  const explicitPrefixes = explicitKeys.map(deletionPrefixForKey);
  const explicitNestedBases = new Set(explicitPrefixes
    .filter(prefix => prefix.includes('/'))
    .map(prefix => getFileParts(prefix).fileNameBase));
  return Array.from(new Set([
    mediaId,
    ...explicitPrefixes,
    ...queuedPrefixes,
  ].filter(prefix => {
    if (!prefix) { return false; }
    if (prefix.includes('/')) { return true; }
    if (prefix === mediaId) { return true; }
    if (prefix !== mediaId && prefix.startsWith(`${mediaId}-`)) {
      return false;
    }
    return !explicitNestedBases.has(prefix);
  })));
};

const listObjectsForPrefix = async (env: Env, prefix: string) => {
  if (isDriveStorageEnabled(env)) {
    return listDriveKeysForPrefix(env, prefix);
  }

  const keys: string[] = [];
  let continuationToken: string | undefined;
  while (true) {
    const query = new URLSearchParams({
      'list-type': '2',
      'max-keys': '1000',
      prefix,
    });
    if (continuationToken) {
      query.set('continuation-token', continuationToken);
    }
    const response = await r2Request(env, 'GET', '', {
      query,
      signal: AbortSignal.timeout(DELETION_STORAGE_TIMEOUT_MS),
    });
    const xml = await response.text();
    for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
      if (match[1]) { keys.push(decodeXmlEntities(match[1])); }
    }
    const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const nextToken = xml.match(
      /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/,
    )?.[1];
    continuationToken = nextToken ? decodeXmlEntities(nextToken) : undefined;
    if (!isTruncated || !continuationToken) { break; }
  }
  return keys;
};

const claimMediaDeletion = async (env: Env) => {
  await ensureMediaDeletionQueueTable(env);
  const sql = sqlForEnv(env);
  return (await sql`
    WITH candidate AS (
      SELECT media_id
      FROM media_deletion_queue
      WHERE status IN ('pending', 'failed')
        OR (
          status='processing' AND
          claimed_at < now() - interval '5 minutes'
        )
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE media_deletion_queue queue
    SET
      status='processing',
      attempts=attempts + 1,
      error_message=NULL,
      claimed_at=now(),
      updated_at=now()
    FROM candidate
    WHERE queue.media_id=candidate.media_id
    RETURNING queue.*
  ` as unknown as MediaDeletionQueueRow[])[0];
};

const cleanupDeletedMediaRecords = async (
  env: Env,
  mediaId: string,
  urls: string[],
) => {
  const sql = sqlForEnv(env);
  await ensureRegistrationStatusTable(env);
  await ensureRegisteredUploadFileMapTable(env);
  await ensureUploadRegistrationHintsTable(env);
  const tables = await sql`
    SELECT
      to_regclass('public.album_media')::text AS album_media,
      to_regclass('public.auth_user_favorites')::text AS favorites
  ` as unknown as Array<{
    album_media?: string | null
    favorites?: string | null
  }>;
  if (tables[0]?.favorites) {
    await sql`DELETE FROM auth_user_favorites WHERE media_id=${mediaId}`;
  }
  if (tables[0]?.album_media) {
    await sql`DELETE FROM album_media WHERE media_id=${mediaId}`;
  }
  if (urls.length > 0) {
    await sql`
      DELETE FROM worker_registration_status
      WHERE media_id=${mediaId}
        OR url = ANY(${urls})
        OR source_url = ANY(${urls})
    `;
    await sql`
      DELETE FROM upload_registration_hints
      WHERE url = ANY(${urls})
    `;
  } else {
    await sql`DELETE FROM worker_registration_status WHERE media_id=${mediaId}`;
  }
  await sql`DELETE FROM registered_upload_file_map WHERE media_id=${mediaId}`;
  await sql`DELETE FROM media WHERE id=${mediaId}`;
};

const processMediaDeletion = async (
  env: Env,
  deletion: MediaDeletionQueueRow,
) => {
  const mediaId = deletion.media_id;
  const urls = stringArray(deletion.urls);
  const explicitKeys = urls
    .map(url => keyFromStorageUrl(env, url))
    .filter(Boolean);
  const prefixes = buildDeletionPrefixes(
    mediaId,
    stringArray(deletion.prefixes),
    explicitKeys,
  );

  await logBackendActivity(env, {
    category: 'orchestrator',
    event: 'deletion_started',
    status: 'info',
    message: `Deleting ${deletion.title || mediaId}`,
    mediaId,
    details: { prefixes, attempt: deletion.attempts || 1 },
  });

  try {
    const keys = new Set(explicitKeys);
    const listedPrefixKeys = await Promise.all(prefixes.map(async prefix => {
      try {
        return { prefix, keys: await listObjectsForPrefix(env, prefix) };
      } catch (error) {
        throw new Error(`Deletion discovery failed for ${prefix}: ${error}`);
      }
    }));
    for (const { prefix, keys: listedKeys } of listedPrefixKeys) {
      listedKeys
        .filter(key => deletionKeyMatchesPrefix(key, prefix))
        .forEach(key => keys.add(key));
    }

    // Drive and R2 deletes are idempotent. Use small parallel batches so slow
    // Drive bookkeeping does not multiply request time for related objects.
    const keysToDelete = Array.from(keys);
    for (
      let index = 0;
      index < keysToDelete.length;
      index += DELETION_MUTATION_CONCURRENCY
    ) {
      await Promise.all(keysToDelete
        .slice(index, index + DELETION_MUTATION_CONCURRENCY)
        .map(async key => {
          try {
            await deleteObject(env, key);
          } catch (error) {
            // A storage gateway can fail after the authoritative object delete
            // has already committed (for example, during lock/inventory
            // bookkeeping). Confirm the object itself before failing the
            // whole media deletion and retrying already-removed keys forever.
            try {
              if (!await storageObjectExists(
                env,
                key,
                DELETION_STORAGE_TIMEOUT_MS,
              )) {
                return;
              }
            } catch {
              // Preserve the original mutation failure when verification is
              // unavailable; a later queue attempt can safely retry it.
            }
            throw new Error(`Storage delete failed for ${key}: ${error}`);
          }
        }));
    }

    const remaining = new Set<string>();
    const remainingPrefixKeys = await Promise.all(prefixes.map(async prefix => {
      try {
        return { prefix, keys: await listObjectsForPrefix(env, prefix) };
      } catch (error) {
        throw new Error(`Deletion verification failed for ${prefix}: ${error}`);
      }
    }));
    for (const { prefix, keys: listedKeys } of remainingPrefixKeys) {
      listedKeys
        .filter(key => deletionKeyMatchesPrefix(key, prefix))
        .forEach(key => remaining.add(key));
    }
    if (remaining.size > 0) {
      throw new Error(
        `Storage cleanup incomplete: ${remaining.size} related object(s) remain`,
      );
    }

    await cleanupDeletedMediaRecords(env, mediaId, urls);
    const sql = sqlForEnv(env);
    await sql`DELETE FROM media_deletion_queue WHERE media_id=${mediaId}`;
    await logBackendActivity(env, {
      category: 'orchestrator',
      event: 'deletion_completed',
      status: 'success',
      message: `Deleted ${deletion.title || mediaId} and ${keys.size} object(s)`,
      mediaId,
      details: { deletedObjects: keys.size, prefixes },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deletion failed';
    const sql = sqlForEnv(env);
    await sql`
      UPDATE media_deletion_queue
      SET status='failed', error_message=${message}, updated_at=now()
      WHERE media_id=${mediaId}
    `;
    await logBackendActivity(env, {
      category: 'orchestrator',
      event: 'deletion_failed',
      status: 'error',
      message,
      mediaId,
      details: { attempt: deletion.attempts || 1 },
    });
    return false;
  }
};

const getDeletionQueueCounts = async (env: Env) => {
  await ensureMediaDeletionQueueTable(env);
  const sql = sqlForEnv(env);
  const rows = await sql`
    SELECT status, COUNT(*)::int AS count
    FROM media_deletion_queue
    GROUP BY status
  ` as unknown as Array<{ status: string, count: number }>;
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = row.count;
    return counts;
  }, {});
};

let lastKnownQueuedDeletionPrefixes = new Set<string>();
const getQueuedDeletionPrefixes = async (env: Env) => {
  // Deletion is handled by the authenticated maintenance route. A queue
  // read/DDL check competes with the registration claim on the 10 ms Free
  // cron budget and is not needed to register unrelated objects. The
  // discovery-only cron is deliberately separate from registration, so it
  // can refresh this protection before inserting new detected rows.
  if (env.REGISTRATION_SCHEDULED === '1') {
    return new Set(lastKnownQueuedDeletionPrefixes);
  }
  try {
    await ensureMediaDeletionQueueTable(env);
    const sql = sqlForEnv(env);
    const rows = await sql`
      SELECT prefixes FROM media_deletion_queue
    ` as unknown as Array<{ prefixes?: unknown }>;
    lastKnownQueuedDeletionPrefixes = new Set(
      rows.flatMap(row => stringArray(row.prefixes)),
    );
  } catch (error) {
    // A transient deletion-queue connection failure must not keep every
    // unrelated upload stuck in `detected`. Retain the most recently known
    // deletion prefixes so a previously queued deletion stays protected.
    console.warn(
      'Unable to read deletion queue; continuing registration with cached prefixes',
      error,
    );
  }
  return new Set(lastKnownQueuedDeletionPrefixes);
};

const drainMediaDeletionQueue = async (env: Env) => {
  let processed = 0;
  for (let index = 0; index < 50; index += 1) {
    const deletion = await claimMediaDeletion(env);
    if (!deletion) { break; }
    const completed = await processMediaDeletion(env, deletion);
    processed += 1;
    if (!completed) { break; }
  }
  return processed;
};

const copyObject = async (
  env: Env,
  sourceKey: string,
  destinationKey: string,
  expectedSize?: number,
) => {
  if (isDriveStorageEnabled(env)) {
    try {
      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const response = await Promise.race([
        fetch(
          `${driveApiBaseUrl(env)}/api/v1/storage/copy`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: driveHeaders(env, {
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
              projectId: env.DRIVE_STORAGE_PROJECT_ID,
              bucket: env.DRIVE_STORAGE_BUCKET,
              fromKey: sourceKey,
              toKey: destinationKey,
            }),
          },
        ),
        new Promise<Response>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            controller.abort();
            reject(new Error('Drive copy request timed out'));
          }, DRIVE_COPY_REQUEST_TIMEOUT_MS);
        }),
      ]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let detail = text;
        try {
          const data = JSON.parse(text) as {
            error?: unknown
            retryable?: unknown
            code?: unknown
          };
          if (data.retryable === true || data.code === 'COPY_NOT_READY') {
            throw new Error(
              `Drive copy not ready: ${typeof data.error === 'string' ? data.error : 'destination is still becoming readable'}`,
            );
          }
          detail = typeof data.error === 'string' ? data.error : text;
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('Drive copy not ready:')) {
            throw error;
          }
        }
        throw new Error(
          `Drive copy failed (${response.status})${detail ? `: ${detail}` : ''}`,
        );
      }
      // Drive's copy endpoint only returns 2xx after its own R2 copy has
      // completed and the destination HEAD matches the source size. A second
      // immediate HEAD from the Worker can still miss the object at the
      // gateway edge and incorrectly turn a successful copy into a five
      // minute queued retry. Preserve the endpoint's verified result.
      return { verified: true };
    } catch (error) {
      if (isDriveTimeoutLikeError(error)) {
        // The Drive endpoint is synchronous and may still be copying when
        // the Worker request reaches its 15s limit. Do one short exact-size
        // probe, then persist the row as registering for the next scan. Do
        // not nest the old 30s existence and size polls here: they could hold
        // the global scan lease for several minutes and make every cron tick
        // report scanSkipped=true.
        const destinationSize = await storageObjectSize(
          env,
          destinationKey,
          REGISTRATION_READY_CHECK_TIMEOUT_MS,
        ).catch(() => undefined);
        if (isExactVerifiedStorageCopy(expectedSize, destinationSize)) {
          return { verified: true, pending: false };
        }
        return { verified: false, pending: true };
      }
      throw error;
    }
  }
  await r2Request(env, 'PUT', destinationKey, {
    headers: {
      'x-amz-copy-source':
        `${env.R2_BUCKET}/${canonicalUriForKey(sourceKey).slice(1)}`,
    },
  });
  return { verified: false };
};

const copyAndVerifyObject = async (
  env: Env,
  sourceKey: string,
  destinationKey: string,
  expectedSize?: number,
) => {
  const copyResult = await copyObject(env, sourceKey, destinationKey, expectedSize);
  if (copyResult.pending) {
    // A timed-out Drive copy may still be running, but its destination has
    // not passed exact-size verification. Keep the durable row registering;
    // never commit metadata or delete the source until verification succeeds.
    throw new Error('Drive copy not ready: destination size is not verified');
  }
  if (copyResult.verified) {
    return;
  }

  const sourceSize = expectedSize === undefined
    ? await storageObjectSize(env, sourceKey)
    : expectedSize;
  const destinationSize = await waitForVerifiedStorageCopy({
    sourceSize,
    readDestinationSize: () => storageObjectSize(
      env,
      destinationKey,
      REGISTRATION_READY_CHECK_TIMEOUT_MS,
    ),
    attempts: isDriveStorageEnabled(env)
      ? DRIVE_COPY_VISIBILITY_ATTEMPTS
      : 1,
    delayMs: isDriveStorageEnabled(env)
      ? DRIVE_COPY_VISIBILITY_DELAY_MS
      : 0,
  });
  if (!isVerifiedStorageCopy(sourceSize, destinationSize)) {
    if (destinationSize === undefined) {
      throw new Error(
        `Copied destination is not readable in storage: ${destinationKey}`,
      );
    }
    throw new Error(
      `Copied destination size mismatch: source=${sourceSize} destination=${destinationSize}`,
    );
  }
};

const buildRegistrationKey = (
  env: Env,
  sourceKey: string,
  mediaId: string,
  extension: string,
) => {
  if (!areUniqueMediaNamesEnabled(env)) {
    return sourceKey;
  }

  const segments = sourceKey.split('/');
  segments[segments.length - 1] = `${mediaId}.${extension}`;
  return segments.join('/');
};

const getMediaRows = async (env: Env) => {
  const sql = sqlForEnv(env);
  return (await sql`
    SELECT id, url, extension, poster_url, preview_url, transcode_status
    FROM media
  `) as unknown as MediaRow[];
};

const getMediaRowsByIds = async (env: Env, ids: string[]) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) { return [] as MediaRow[]; }
  const sql = sqlForEnv(env);
  return (await sql`
    SELECT id, url, extension, poster_url, preview_url, transcode_status
    FROM media
    WHERE id = ANY(${uniqueIds})
  `) as unknown as MediaRow[];
};

const getMediaRowsByUrls = async (env: Env, urls: string[]) => {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  if (uniqueUrls.length === 0) { return [] as MediaRow[]; }
  const sql = sqlForEnv(env);
  return (await sql`
    SELECT id, url, extension, poster_url, preview_url, transcode_status
    FROM media
    WHERE url = ANY(${uniqueUrls})
      OR poster_url = ANY(${uniqueUrls})
      OR preview_url = ANY(${uniqueUrls})
  `) as unknown as MediaRow[];
};

const PROCESSING_SOURCE_MISSING_ERROR =
  'Source file is missing from storage. Upload a replacement to retry.';

export const shouldMarkProcessingSourceMissing = ({
  status,
  sourceKey,
  isListed,
  exists,
}: {
  status?: string | null
  sourceKey: string
  isListed: boolean
  exists?: boolean
}) =>
  (status === 'pending' || status === 'processing') &&
  (!sourceKey || (!isListed && exists === false));

const processingSourceExists = async (
  env: Env,
  key: string,
  timeoutMs = DELETION_STORAGE_TIMEOUT_MS,
) => {
  if (isDriveStorageEnabled(env)) {
    const keys = await listDriveKeysForPrefix(
      env,
      key,
      timeoutMs,
    );
    return keys.includes(key);
  }
  return storageObjectExists(env, key, timeoutMs);
};

const markProcessingSourceMissing = async (env: Env, mediaId: string) => {
  const sql = sqlForEnv(env);
  await sql`
    UPDATE media
    SET
      transcode_status='failed',
      transcode_error=${PROCESSING_SOURCE_MISSING_ERROR},
      updated_at=now()
    WHERE id=${mediaId}
      AND transcode_status IN ('pending', 'processing')
  `;
  await logBackendActivity(env, {
    category: 'processing',
    event: 'source_missing',
    status: 'error',
    message: PROCESSING_SOURCE_MISSING_ERROR,
    mediaId,
  });
  await revalidateMediaPanel(env, mediaId).catch(() => undefined);
};

const reconcileMissingProcessingSources = async (
  env: Env,
  rows: MediaRow[],
  listedKeys: Set<string>,
) => {
  let missing = 0;
  const candidates = rows.filter(row =>
    row.transcode_status === 'pending' || row.transcode_status === 'processing');
  const unchecked: MediaRow[] = [];
  const checks = candidates.slice(0, PROCESSING_SOURCE_RECONCILIATION_LIMIT);
  for (let offset = 0; offset < checks.length; offset += PROCESSING_SOURCE_RECONCILIATION_CONCURRENCY) {
    const batch = checks.slice(
      offset,
      offset + PROCESSING_SOURCE_RECONCILIATION_CONCURRENCY,
    );
    const results = await Promise.all(batch.map(async row => {
      const sourceKey = keyFromStorageUrl(env, row.url);
      const isListed = Boolean(sourceKey && listedKeys.has(sourceKey));
      if (!sourceKey || isListed) {
        return { row, sourceKey, isListed, exists: undefined as boolean | undefined };
      }
      try {
        const exists = await processingSourceExists(
          env,
          sourceKey,
          PROCESSING_SOURCE_RECONCILIATION_TIMEOUT_MS,
        );
        return { row, sourceKey, isListed, exists };
      } catch (error) {
        console.warn('Skipping processing source reconciliation', {
          mediaId: row.id,
          sourceKey,
          error,
        });
        return { row, sourceKey, isListed, exists: undefined as boolean | undefined };
      }
    }));
    for (const { row, sourceKey, isListed, exists } of results) {
      if (shouldMarkProcessingSourceMissing({
        status: row.transcode_status,
        sourceKey: sourceKey || '',
        isListed,
        exists,
      })) {
        await markProcessingSourceMissing(env, row.id);
        missing += 1;
      }
    }
  }
  if (candidates.length > checks.length) {
    unchecked.push(...candidates.slice(checks.length));
  }
  if (unchecked.length > 0) {
    console.info('Deferred processing source reconciliation', {
      checked: checks.length,
      deferred: unchecked.length,
    });
  }
  /*
   * The previous implementation checked every missing source serially. With
   * a Drive-backed library that meant dozens of 15-second list requests could
   * keep the scan lease alive for many minutes, so the next cron looked
   * stalled and no registration work progressed. Keep this maintenance pass
   * bounded; deferred rows are checked on later scans.
  */
  return missing;
};

const countPendingVideos = async (env: Env) => {
  const sql = sqlForEnv(env);
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM media
    WHERE transcode_status='pending'
  `) as unknown as { count: number }[];
  return rows[0]?.count ?? 0;
};

const getExpectedRegistrationKeyForHint = async (
  env: Env,
  hintKey: string,
) => {
  const { extension } = getFileParts(hintKey);
  if (!MEDIA_EXTENSIONS.has(extension)) {
    return undefined;
  }

  const mediaId = await mediaIdForObject(env, hintKey);
  const registrationKey = buildRegistrationKey(
    env,
    hintKey,
    mediaId,
    extension,
  );
  return registrationKey === hintKey ? undefined : registrationKey;
};

const getExpectedRegistrationUrlForStatusRow = async (
  env: Env,
  row: RegistrationStatusRow,
) => {
  // A detected row has not allocated an ID and cannot have an in-flight
  // generated destination. Avoid hashing every detected backlog item on each
  // scan; only rows that already carry an ID need destination protection.
  const mediaId = trimToUndefined(row.media_id);
  if (!mediaId) { return undefined; }
  const baseUrl = trimToUndefined(row.source_url) || trimToUndefined(row.url);
  if (!baseUrl) { return undefined; }
  const sourceKey = keyFromStorageUrl(env, baseUrl);
  if (!sourceKey) { return undefined; }
  const extension =
    trimToUndefined(row.extension) ||
    trimToUndefined(getFileParts(sourceKey).extension);
  if (!extension || !MEDIA_EXTENSIONS.has(extension)) {
    return undefined;
  }
  return urlForKey(
    env,
    buildRegistrationKey(env, sourceKey, mediaId, extension),
  );
};

const buildRegistrationStatusLookup = async (
  env: Env,
  rows: RegistrationStatusRow[],
) => {
  const byUrl = new Map<string, RegistrationStatusRow>();
  for (const row of rows) {
    byUrl.set(row.url, row);
    const sourceUrl = trimToUndefined(row.source_url);
    if (sourceUrl) {
      byUrl.set(sourceUrl, row);
    }
    const expectedUrl = await getExpectedRegistrationUrlForStatusRow(env, row)
      .catch(() => undefined);
    if (expectedUrl) {
      byUrl.set(expectedUrl, row);
    }
  }
  return byUrl;
};

const findReadyRegistrationKeys = async (
  env: Env,
  rows: RegistrationStatusRow[],
  objectsByKey: Map<string, R2ObjectLike>,
) => {
  const activeRows = rows
    .filter(row => row.status === 'registering')
    // PostgreSQL does not guarantee row order without ORDER BY. Keep the
    // readiness probe deterministic and FIFO so a large set of Drive copies
    // cannot starve older claims behind the first arbitrary eight rows.
    .sort((left, right) => {
      const leftUploaded = parseDateValue(left.uploaded_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightUploaded = parseDateValue(right.uploaded_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftUploaded !== rightUploaded) {
        return leftUploaded - rightUploaded;
      }
      const leftUpdated = parseDateValue(left.updated_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightUpdated = parseDateValue(right.updated_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftUpdated !== rightUpdated) {
        return leftUpdated - rightUpdated;
      }
      return left.url.localeCompare(right.url);
    })
    .slice(0, REGISTRATION_READY_CHECK_LIMIT);
  if (activeRows.length === 0) { return new Set<string>(); }
  const readyKeys = new Set<string>();
  await Promise.all(activeRows.map(async row => {
    const sourceUrl = trimToUndefined(row.source_url) || trimToUndefined(row.url);
    if (!sourceUrl) { return; }
    const sourceKey = keyFromStorageUrl(env, sourceUrl);
    if (!sourceKey || !objectsByKey.has(sourceKey)) { return; }
    const expectedUrl = await getExpectedRegistrationUrlForStatusRow(env, row)
      .catch(() => undefined);
    const expectedKey = expectedUrl
      ? keyFromStorageUrl(env, expectedUrl)
      : '';
    if (!expectedKey || expectedKey === sourceKey) { return; }
    // A Drive copy may become visible before the stale-row recovery window.
    // Probe only a small number of active claims so a ready copy can be
    // committed on the next scan without starting a duplicate copy.
    const sourceSize = objectsByKey.get(sourceKey)?.size ??
      await storageObjectSize(env, sourceKey).catch(() => undefined);
    const destinationSize = await storageObjectSize(
      env,
      expectedKey,
      REGISTRATION_READY_CHECK_TIMEOUT_MS,
    ).catch(() => undefined);
    if (isExactVerifiedStorageCopy(sourceSize, destinationSize)) {
      readyKeys.add(sourceKey);
    }
  }));
  return readyKeys;
};

let uploadRegistrationHintsTableReady: Promise<void> | undefined;
const ensureUploadRegistrationHintsTable = async (env: Env) => {
  if (env.REGISTRATION_SCHEDULED === '1') return;
  if (!uploadRegistrationHintsTableReady) {
    const sql = sqlForEnv(env);
    uploadRegistrationHintsTableReady = sql`
      CREATE TABLE IF NOT EXISTS upload_registration_hints (
        url TEXT PRIMARY KEY,
        original_file_name TEXT,
        title TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `.then(() => undefined);
  }
  try {
    await uploadRegistrationHintsTableReady;
  } catch (error) {
    uploadRegistrationHintsTableReady = undefined;
    throw error;
  }
};

const ensureUploadRegistrationHintsColumnTypes = async (env: Env) => {
  // The CREATE statement above is the steady-state schema contract. Older
  // deployments already completed the one-time VARCHAR-to-TEXT migration;
  // repeating ALTER TABLE in every fresh Worker isolate wastes subrequests.
  await ensureUploadRegistrationHintsTable(env);
};

const getUploadRegistrationHints = async (env: Env, urls: string[]) => {
  if (urls.length === 0) {
    return new Map<string, UploadRegistrationHintRow>();
  }
  if (env.REGISTRATION_SCHEDULED === '1') {
    return new Map<string, UploadRegistrationHintRow>();
  }
  // Hints are optional metadata. Never let a Supabase pooler drop block the
  // registration queue; storage keys are a complete fallback for filenames.
  if (env.REGISTRATION_HINT_LOOKUPS_ENABLED !== '1') {
    return new Map<string, UploadRegistrationHintRow>();
  }
  try {
    await ensureUploadRegistrationHintsTable(env);
    await ensureUploadRegistrationHintsColumnTypes(env);
  } catch (error) {
    console.warn('Upload registration hints unavailable; continuing without hints', error);
    return new Map<string, UploadRegistrationHintRow>();
  }
  const sql = sqlForEnv(env);
  const requestedUrls = new Map(urls.map(url => [url, {
    canonical: canonicalizeStorageUrl(url),
    decoded: decodeStorageUrlPath(url),
  }]));
  const lookupUrls = Array.from(new Set(
    Array.from(requestedUrls.values()).flatMap(({ canonical, decoded }) => [
      canonical,
      decoded,
    ]),
  ));
  const rows: UploadRegistrationHintRow[] = [];
  for (let offset = 0; offset < lookupUrls.length; offset += 200) {
    const chunk = lookupUrls.slice(offset, offset + 200);
    try {
      const chunkRows = (await sql`
        SELECT url, original_file_name, title
        FROM upload_registration_hints
        WHERE url = ANY(${chunk})
      `) as unknown as UploadRegistrationHintRow[];
      rows.push(...chunkRows);
    } catch (error) {
      console.warn('Upload registration hint chunk unavailable; continuing without it', {
        offset,
        error,
      });
    }
  }
  const rowsByUrl = new Map(rows.map(row => [row.url, row]));
  const rowsByCanonicalUrl = new Map(
    rows.map(row => [canonicalizeStorageUrl(row.url), row]),
  );
  const rowsByDecodedUrl = new Map(
    rows.map(row => [decodeStorageUrlPath(row.url), row]),
  );

  const resolved = new Map<string, UploadRegistrationHintRow>();
  urls.forEach(url => {
    const variants = requestedUrls.get(url);
    if (!variants) { return; }
    const row =
      rowsByUrl.get(url) ||
      rowsByUrl.get(variants.canonical) ||
      rowsByUrl.get(variants.decoded) ||
      rowsByCanonicalUrl.get(variants.canonical) ||
      rowsByDecodedUrl.get(variants.decoded);
    if (row) {
      resolved.set(url, row);
    }
  });
  return resolved;
};

const getPendingUploadRegistrationHints = async (env: Env) => {
  if (
    env.REGISTRATION_SCHEDULED === '1' ||
    env.REGISTRATION_HINT_LOOKUPS_ENABLED !== '1'
  ) {
    return [];
  }
  try {
    await ensureUploadRegistrationHintsTable(env);
    await ensureUploadRegistrationHintsColumnTypes(env);
    const sql = sqlForEnv(env);
    return (await sql`
      SELECT url, original_file_name, title, updated_at, created_at
      FROM upload_registration_hints
      ORDER BY updated_at DESC
    `) as unknown as UploadRegistrationHintRow[];
  } catch (error) {
    console.warn('Pending upload registration hints unavailable; continuing without hints', error);
    return [];
  }
};

const replaceUploadRegistrationHintUrl = async (
  env: Env,
  previousUrl: string,
  nextUrl: string,
) => {
  if (previousUrl === nextUrl) { return; }
  await ensureUploadRegistrationHintsTable(env);
  await ensureUploadRegistrationHintsColumnTypes(env);
  const sql = sqlForEnv(env);
  const rows = (await sql`
    SELECT url, original_file_name, title
    FROM upload_registration_hints
    WHERE url = ANY(${[previousUrl, nextUrl]})
  `) as unknown as UploadRegistrationHintRow[];
  const previousRow = rows.find(row => row.url === previousUrl);
  if (!previousRow) { return; }
  const nextRow = rows.find(row => row.url === nextUrl);
  const originalFileName =
    trimToUndefined(previousRow.original_file_name) ||
    trimToUndefined(nextRow?.original_file_name);
  const title =
    trimToUndefined(previousRow.title) ||
    trimToUndefined(nextRow?.title);
  await sql`
    INSERT INTO upload_registration_hints (url, original_file_name, title)
    VALUES (${nextUrl}, ${originalFileName ?? null}, ${title ?? null})
    ON CONFLICT (url) DO UPDATE SET
      original_file_name=COALESCE(
        EXCLUDED.original_file_name,
        upload_registration_hints.original_file_name
      ),
      title=COALESCE(EXCLUDED.title, upload_registration_hints.title),
      updated_at=now()
  `;
  await sql`
    DELETE FROM upload_registration_hints
    WHERE url=${previousUrl}
  `;
};

const clearUploadRegistrationHint = async (env: Env, url: string) => {
  return clearUploadRegistrationHints(env, [url]);
};

const clearUploadRegistrationHints = async (env: Env, urls: string[]) => {
  if (env.REGISTRATION_SCHEDULED === '1') return;
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  if (uniqueUrls.length === 0) { return; }
  await ensureUploadRegistrationHintsTable(env);
  await ensureUploadRegistrationHintsColumnTypes(env);
  const sql = sqlForEnv(env);
  await sql`
    DELETE FROM upload_registration_hints
    WHERE url = ANY(${uniqueUrls})
  `;
};

const clearTrackedRegistration = async (
  env: Env,
  urls: Array<string | undefined>,
) => {
  const trackedUrls = Array.from(new Set(
    urls
      .map(url => trimToUndefined(url))
      .filter((url): url is string => Boolean(url)),
  ));
  if (trackedUrls.length === 0) { return; }

  await ensureRegistrationStatusTable(env);
  await ensureUploadRegistrationHintsTable(env);
  await ensureUploadRegistrationHintsColumnTypes(env);
  const sql = sqlForEnv(env);
  await sql`
    DELETE FROM worker_registration_status
    WHERE url = ANY(${trackedUrls})
      OR source_url = ANY(${trackedUrls})
  `;
  await sql`
    DELETE FROM upload_registration_hints
    WHERE url = ANY(${trackedUrls})
  `;
};

let registrationStatusTableReady: Promise<void> | undefined;
const ensureRegistrationStatusTable = async (env: Env) => {
  if (env.REGISTRATION_SCHEDULED === '1') return;
  if (!registrationStatusTableReady) {
    const sql = sqlForEnv(env);
    registrationStatusTableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS worker_registration_status (
          url TEXT PRIMARY KEY,
          file_name TEXT,
          uploaded_at TIMESTAMP WITH TIME ZONE,
          status VARCHAR(32) NOT NULL,
          source_url TEXT,
          original_file_name TEXT,
          title TEXT,
          media_id TEXT,
          extension TEXT,
          error_message TEXT,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
    })();
  }
  try {
    await registrationStatusTableReady;
  } catch (error) {
    registrationStatusTableReady = undefined;
    throw error;
  }
};

const clearStaleRegistrationStatuses = async (env: Env) => {
  const sql = sqlForEnv(env);
  const minutes = getNumber(env.STALE_REGISTRATION_MINUTES, 15, {
    min: 1,
    max: 24 * 60,
  });
  // Remove the misleading legacy marker from rows that were never claimed.
  // Their normal state is detected, and they remain eligible for FIFO work.
  await sql`
    UPDATE worker_registration_status
    SET error_message=NULL
    WHERE status='detected'
      AND error_message=${STALE_REGISTRATION_ERROR_MESSAGE}
  `;
  const recoveredRows = await sql`
    UPDATE worker_registration_status
    SET
      status='detected',
      -- A stale copy is recoverable queue state, not a permanent error. Keep
      -- the panel free of a misleading error marker while the source is
      -- requeued for another bounded attempt.
      error_message=NULL,
      updated_at=now()
    -- A detected row has not started an attempt. Rewriting it as "stalled"
    -- made an idle backlog look like every file had failed. Only recover a
    -- file that was actually claimed and left in registering.
    WHERE status='registering'
      AND (
        media_id IS NULL
        OR updated_at < now() - (${String(minutes)} || ' minutes')::interval
      )
    RETURNING url
  ` as unknown as Array<{ url: string }>;
  // A transient Drive 5xx can be reported after the copy request has already
  // reached the storage service. Keep those rows in the durable queue instead
  // of requiring a manual retry or leaving a permanent registration error.
  const transientErrorRows = await sql`
    UPDATE worker_registration_status
    SET
      status='detected',
      error_message=NULL,
      updated_at=now()
    WHERE status='error'
      AND (
        error_message LIKE 'Drive copy failed (5%'
        OR error_message LIKE 'Drive copy not ready:%'
        OR error_message LIKE 'Copied destination is not readable in storage:%'
        OR error_message LIKE 'Copied destination size mismatch:%'
        OR error_message ILIKE '%timed out%'
        OR error_message ILIKE '%timeout%'
      )
    RETURNING url
  ` as unknown as Array<{ url: string }>;
  return recoveredRows.length + transientErrorRows.length;
};

const clearOldCompletedRegistrationStatuses = async (env: Env) => {
  const sql = sqlForEnv(env);
  const days = getNumber(env.REGISTRATION_HISTORY_DAYS, 14, {
    min: 1,
    max: 365,
  });
  await sql`
    DELETE FROM worker_registration_status
    WHERE status IN ('registered', 'error')
      AND updated_at < now() - (${String(days)} || ' days')::interval
  `;
};

const clearResolvedRegistrationStatuses = async (env: Env) => {
  const sql = sqlForEnv(env);
  await sql`
    DELETE FROM worker_registration_status s
    WHERE EXISTS (
      SELECT 1
      FROM media m
      WHERE m.url=s.url
        OR (s.source_url IS NOT NULL AND m.url=s.source_url)
    )
      AND (
        -- A media row without a tracking map is safe to clear (for example,
        -- unique names are disabled), but a map alone is not proof that the
        -- media commit succeeded. Require the map's media row to match before
        -- clearing a tracked registration or allowing cleanup to proceed.
        NOT EXISTS (
          SELECT 1
          FROM registered_upload_file_map f
          WHERE s.media_id IS NOT NULL AND f.media_id=s.media_id
        )
        OR EXISTS (
          SELECT 1
          FROM registered_upload_file_map f
          JOIN media mapped_media ON mapped_media.id=f.media_id
          WHERE s.media_id IS NOT NULL
            AND f.media_id=s.media_id
            AND mapped_media.url=f.stored_url
        )
      )
  `;
};

const getRegistrationStatusRows = async (env: Env, limit?: number) => {
  await ensureRegistrationStatusTable(env);
  const sql = sqlForEnv(env);
  if (limit !== undefined) {
    return (await sql`
      SELECT
        url,
        file_name,
        uploaded_at,
        status,
        source_url,
        original_file_name,
        title,
        media_id,
        extension,
        error_message,
        updated_at
      FROM worker_registration_status
      WHERE status='detected'
        OR (
          status='registering'
          AND updated_at < now() - (
            ${String(getNumber(env.STALE_REGISTRATION_MINUTES, 15, {
              min: 1,
              max: 24 * 60,
            }))} || ' minutes'
          )::interval
        )
        OR (
          status='error'
          AND (
            error_message IS NULL
            OR error_message ILIKE '%timeout%'
            OR error_message ILIKE '%connection terminated%'
            OR error_message ILIKE '%connection reset%'
            OR error_message LIKE 'Drive copy failed (5%'
            OR error_message LIKE 'Drive copy not ready:%'
            OR error_message LIKE 'Copied destination is not readable in storage:%'
            OR error_message LIKE 'Copied destination size mismatch:%'
          )
        )
      ORDER BY uploaded_at ASC NULLS LAST, updated_at ASC, url ASC
      LIMIT ${Math.max(1, Math.min(Math.round(limit), 25))}
    `) as unknown as RegistrationStatusRow[];
  }
  return (await sql`
    SELECT
      url,
      file_name,
      uploaded_at,
      status,
      source_url,
      original_file_name,
      title,
      media_id,
      extension,
      error_message,
      updated_at
    FROM worker_registration_status
  `) as unknown as RegistrationStatusRow[];
};

// Atomically reserve exactly one eligible FIFO row. The claim itself is the
// concurrency guard for scheduled work: fresh `registering` rows are excluded
// so a slow copy can never fill the limit ahead of newly detected uploads.
const claimRegistrationQueueRow = async (env: Env) => {
  const sql = sqlForEnv(env);
  const staleMinutes = getNumber(env.STALE_REGISTRATION_MINUTES, 15, {
    min: 1,
    max: 24 * 60,
  });
  const rows = await sql`
    WITH candidate AS (
      SELECT url
      FROM worker_registration_status
      WHERE status='detected'
        OR (
          status='registering'
          AND updated_at < now() - (${String(staleMinutes)} || ' minutes')::interval
        )
        OR (
          status='error'
          AND (
            error_message IS NULL
            OR error_message ILIKE '%timeout%'
            OR error_message ILIKE '%connection terminated%'
            OR error_message ILIKE '%connection reset%'
            OR error_message LIKE 'Drive copy failed (5%'
            OR error_message LIKE 'Drive copy not ready:%'
            OR error_message LIKE 'Copied destination is not readable in storage:%'
            OR error_message LIKE 'Copied destination size mismatch:%'
          )
        )
      ORDER BY uploaded_at ASC NULLS LAST, updated_at ASC, url ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE worker_registration_status AS status_row
    SET status='registering', updated_at=now(), error_message=NULL
    FROM candidate
    WHERE status_row.url=candidate.url
    RETURNING
      status_row.url,
      status_row.file_name,
      status_row.uploaded_at,
      status_row.status,
      status_row.source_url,
      status_row.original_file_name,
      status_row.title,
      status_row.media_id,
      status_row.extension,
      status_row.error_message,
      status_row.updated_at
  ` as unknown as RegistrationStatusRow[];
  const claimed = rows[0];
  // Process the row immediately in this invocation. It is persisted as
  // `registering` for crash recovery, but represented as eligible in memory so
  // the normal pending/batch selector does not defer its own claim.
  if (claimed) {
    return {
      row: { ...claimed, status: 'detected' },
      queueHasRows: true,
    };
  }
  return {
    row: undefined,
    queueHasRows: false,
  };
};

const getRegistrationStatusRowsByUrls = async (env: Env, urls: string[]) => {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  if (uniqueUrls.length === 0) { return [] as RegistrationStatusRow[]; }
  const sql = sqlForEnv(env);
  return (await sql`
    SELECT
      url, file_name, uploaded_at, status, source_url, original_file_name,
      title, media_id, extension, error_message, updated_at
    FROM worker_registration_status
    WHERE url = ANY(${uniqueUrls}) OR source_url = ANY(${uniqueUrls})
  `) as unknown as RegistrationStatusRow[];
};

const getTrackedRegistrationStatuses = async (env: Env) => {
  await ensureRegistrationStatusTable(env);
  await ensureRegisteredUploadFileMapTable(env);
  await clearStaleRegistrationStatuses(env);
  await clearResolvedRegistrationStatuses(env);
  await clearOldCompletedRegistrationStatuses(env);
  return getRegistrationStatusRows(env);
};

const setRegistrationStatus = async (
  env: Env,
  row: RegistrationStatusWrite,
) => upsertRegistrationStatuses(env, [row]);

type RegistrationStatusWrite = {
  url: string
  fileName?: string
  uploadedAt?: string
  status: 'detected' | 'registering' | 'registered' | 'error'
  sourceUrl?: string
  originalFileName?: string
  title?: string
  mediaId?: string
  extension?: string
  errorMessage?: string
  touchUpdatedAt?: boolean
};

type HlsArtifactMetadata = {
  key?: string
  size?: number
  contentType?: string
};

const REGISTRATION_STATUS_WRITE_BATCH_SIZE = 25;
const upsertRegistrationStatusBatch = async (
  env: Env,
  rows: RegistrationStatusWrite[],
) => {
  const preserveUpdatedAtRows = rows.filter(row => row.touchUpdatedAt === false);
  for (const row of preserveUpdatedAtRows) {
    const sql = sqlForEnv(env);
    await sql`
      UPDATE worker_registration_status
      SET
        file_name=COALESCE(${row.fileName ?? null}, file_name),
        uploaded_at=COALESCE(${row.uploadedAt ?? null}, uploaded_at),
        status=${row.status},
        source_url=COALESCE(${row.sourceUrl ?? null}, source_url),
        original_file_name=COALESCE(${row.originalFileName ?? null}, original_file_name),
        title=COALESCE(${row.title ?? null}, title),
        media_id=COALESCE(${row.mediaId ?? null}, media_id),
        extension=COALESCE(${row.extension ?? null}, extension),
        error_message=${row.errorMessage ?? null}
      WHERE url=${row.url} OR source_url=${row.url}
    `;
  }
  rows = rows.filter(row => row.touchUpdatedAt !== false);
  if (rows.length === 0) return;
  const payload = JSON.stringify(rows.map(({
    url,
    fileName,
    uploadedAt,
    status,
    sourceUrl,
    originalFileName,
    title,
    mediaId,
    extension,
    errorMessage,
  }) => ({
    url,
    file_name: fileName ?? null,
    uploaded_at: uploadedAt ?? null,
    status,
    source_url: sourceUrl ?? null,
    original_file_name: originalFileName ?? null,
    title: title ?? null,
    media_id: mediaId ?? null,
    extension: extension ?? null,
    error_message: errorMessage ?? null,
  })));
  const sql = sqlForEnv(env);
  await sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS row(
        url TEXT,
        file_name TEXT,
        uploaded_at TIMESTAMP WITH TIME ZONE,
        status VARCHAR(32),
        source_url TEXT,
        original_file_name TEXT,
        title TEXT,
        media_id TEXT,
        extension TEXT,
        error_message TEXT
      )
    )
    INSERT INTO worker_registration_status (
      url,
      file_name,
      uploaded_at,
      status,
      source_url,
      original_file_name,
      title,
      media_id,
      extension,
      error_message
    )
    SELECT
      url,
      file_name,
      uploaded_at,
      status,
      source_url,
      original_file_name,
      title,
      media_id,
      extension,
      error_message
    FROM incoming
    ON CONFLICT (url) DO UPDATE SET
      file_name=COALESCE(EXCLUDED.file_name, worker_registration_status.file_name),
      uploaded_at=COALESCE(EXCLUDED.uploaded_at, worker_registration_status.uploaded_at),
      source_url=COALESCE(EXCLUDED.source_url, worker_registration_status.source_url),
      original_file_name=COALESCE(EXCLUDED.original_file_name, worker_registration_status.original_file_name),
      title=COALESCE(EXCLUDED.title, worker_registration_status.title),
      media_id=COALESCE(EXCLUDED.media_id, worker_registration_status.media_id),
      extension=COALESCE(EXCLUDED.extension, worker_registration_status.extension),
      error_message=CASE
        WHEN worker_registration_status.status='registering'
          AND EXCLUDED.status='detected'
          THEN worker_registration_status.error_message
        ELSE EXCLUDED.error_message
      END,
      status=CASE
        WHEN worker_registration_status.status='registering'
          AND EXCLUDED.status='detected'
          THEN worker_registration_status.status
        ELSE EXCLUDED.status
      END,
      updated_at=now()
  `;
};

const upsertRegistrationStatuses = async (
  env: Env,
  rows: RegistrationStatusWrite[],
) => {
  for (
    let offset = 0;
    offset < rows.length;
    offset += REGISTRATION_STATUS_WRITE_BATCH_SIZE
  ) {
    await upsertRegistrationStatusBatch(
      env,
      rows.slice(offset, offset + REGISTRATION_STATUS_WRITE_BATCH_SIZE),
    );
  }
};

const clearRegistrationStatus = async (env: Env, url: string) => {
  const sql = sqlForEnv(env);
  await sql`
    DELETE FROM worker_registration_status
    WHERE url=${url} OR source_url=${url}
  `;
};

const clearRegistrationTrackingAfterSuccess = async (
  env: Env,
  {
    mediaId,
    urls,
  }: {
    mediaId: string
    urls: string[]
  },
) => {
  const sql = sqlForEnv(env);
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  await sql`
    DELETE FROM worker_registration_status
    WHERE media_id=${mediaId}
      OR url = ANY(${uniqueUrls})
      OR source_url = ANY(${uniqueUrls})
  `;
};

const replaceRegistrationStatusUrl = async (
  env: Env,
  previousUrl: string,
  nextUrl: string,
) => {
  if (previousUrl === nextUrl) {
    await setRegistrationStatus(env, { url: nextUrl, status: 'registering' });
    return;
  }
  const sql = sqlForEnv(env);
  await sql`
    INSERT INTO worker_registration_status (
      url,
      file_name,
      uploaded_at,
      status,
      source_url,
      original_file_name,
      title,
      media_id,
      extension,
      error_message
    )
    SELECT
      ${nextUrl},
      file_name,
      uploaded_at,
      'registering',
      source_url,
      original_file_name,
      title,
      media_id,
      extension,
      NULL
    FROM worker_registration_status
    WHERE url=${previousUrl}
    ON CONFLICT (url) DO UPDATE SET
      file_name=COALESCE(EXCLUDED.file_name, worker_registration_status.file_name),
      uploaded_at=COALESCE(EXCLUDED.uploaded_at, worker_registration_status.uploaded_at),
      status='registering',
      source_url=COALESCE(EXCLUDED.source_url, worker_registration_status.source_url),
      original_file_name=COALESCE(EXCLUDED.original_file_name, worker_registration_status.original_file_name),
      title=COALESCE(EXCLUDED.title, worker_registration_status.title),
      media_id=COALESCE(EXCLUDED.media_id, worker_registration_status.media_id),
      extension=COALESCE(EXCLUDED.extension, worker_registration_status.extension),
      error_message=NULL,
      updated_at=now()
  `;
  await sql`
    DELETE FROM worker_registration_status
    WHERE url=${previousUrl}
  `;
  await setRegistrationStatus(env, {
    url: nextUrl,
    status: 'registering',
  });
};

const syncDetectedStatuses = async (
  env: Env,
  pending: R2ObjectLike[],
  registrationRowsByUrl: Map<string, RegistrationStatusRow>,
) => {
  const pendingUrls = pending.map(object => urlForKey(env, object.key));
  const hintsByUrl = await getUploadRegistrationHints(env, pendingUrls);
  const pendingByUrl = new Map<string, {
    fileName: string
    uploadedAt?: string
    sourceUrl: string
    title?: string
  }>();

  pending.forEach(object => {
    const pendingUrl = urlForKey(env, object.key);
    const hint = hintsByUrl.get(pendingUrl);
    const statusRow = registrationRowsByUrl.get(pendingUrl);
    const originalFileName =
      resolveRegistrationOriginalFileName({
        hint,
        statusRow,
        fallbackFileName: getFileParts(object.key).fileName,
      }) || getFileParts(object.key).fileName;
    pendingByUrl.set(pendingUrl, {
      fileName: originalFileName,
      uploadedAt: object.uploaded?.toISOString(),
      sourceUrl: resolveRegistrationSourceUrl(statusRow, pendingUrl),
      title: resolveRegistrationTitle({
        originalFileName,
        fallbackFileName: getFileParts(object.key).fileName,
      }),
    });
  });

  const newStatuses = Array.from(pendingByUrl.entries())
    .filter(([url]) => !registrationRowsByUrl.has(url))
    .map(([url, pendingRow]) => ({
      url,
      fileName: pendingRow.fileName,
      uploadedAt: pendingRow.uploadedAt,
      status: 'detected',
      sourceUrl: pendingRow.sourceUrl,
      originalFileName: pendingRow.fileName,
      title: pendingRow.title,
      errorMessage: undefined,
    }));
  await upsertRegistrationStatuses(env, newStatuses);
};

// Scheduled scans normally claim one durable queue row and avoid a full
// inventory walk so the Free-plan CPU budget stays bounded. That optimization
// must not starve discovery: direct Drive uploads do not create panel hints and
// would otherwise remain invisible until the entire older queue drained. Keep
// discovery on its own bounded cron and insert only genuinely unknown source
// objects in one SQL statement. Registration itself is performed by the FIFO
// claim on a later invocation.
const discoverRegistrationPage = async (
  env: Env,
  objects: R2ObjectLike[],
  queuedDeletionPrefixes?: ReadonlySet<string>,
) => {
  const deletionPrefixes = queuedDeletionPrefixes ??
    await getQueuedDeletionPrefixes(env);
  const candidates = objects
    .map(object => {
      const { fileName, fileNameBase, extension } = getFileParts(object.key);
      if (
        !MEDIA_EXTENSIONS.has(extension) ||
        GENERATED_MEDIA_SUFFIX_REGEX.test(fileNameBase) ||
        Array.from(deletionPrefixes).some(prefix =>
          deletionKeyMatchesPrefix(object.key, prefix))
      ) {
        return undefined;
      }
      const url = urlForKey(env, object.key);
      return {
        url,
        fileName,
        extension,
        uploadedAt: object.uploaded?.toISOString() ?? null,
        title: resolveRegistrationTitle({
          originalFileName: fileName,
          fallbackFileName: fileName,
        }),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  if (candidates.length === 0) { return 0; }

  const sql = sqlForEnv(env);
  const payload = JSON.stringify(candidates.map(candidate => ({
    url: candidate.url,
    file_name: candidate.fileName,
    extension: candidate.extension,
    uploaded_at: candidate.uploadedAt,
    title: candidate.title,
  })));
  const rows = await sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS row(
        url TEXT,
        file_name TEXT,
        extension TEXT,
        uploaded_at TIMESTAMP WITH TIME ZONE,
        title TEXT
      )
    ), candidates AS (
      SELECT i.*
      FROM incoming i
      WHERE NOT EXISTS (
        SELECT 1
        FROM worker_registration_status s
        WHERE s.url=i.url OR s.source_url=i.url
      )
        AND NOT EXISTS (
          SELECT 1
          FROM registered_upload_file_map f
          WHERE f.source_url=i.url OR f.stored_url=i.url
        )
        AND NOT EXISTS (
          SELECT 1
          FROM media m
          WHERE m.url=i.url OR m.poster_url=i.url OR m.preview_url=i.url
        )
    )
    INSERT INTO worker_registration_status (
      url,
      file_name,
      uploaded_at,
      status,
      source_url,
      original_file_name,
      title,
      extension,
      error_message
    )
    SELECT
      url,
      file_name,
      uploaded_at,
      'detected',
      url,
      file_name,
      title,
      extension,
      NULL
    FROM candidates
    ON CONFLICT (url) DO NOTHING
    RETURNING url
  ` as unknown as Array<{ url: string }>;
  return rows.length;
};

const runRegistrationDiscoveryPage = async (
  env: Env,
  pageSize: number,
) => {
  try {
    const cursor = await getRegistrationScanCursor(env);
    const page = await listStoragePage(env, cursor, pageSize);
    let recent: StorageListPage = { objects: [] };
    if (isDriveStorageEnabled(env)) {
      try {
        // The upload-time lane stays small and hot; the cursor lane below is
        // the durable backfill for the rest of the bucket.
        recent = await listRecentStoragePage(
          env,
          Math.min(pageSize, REGISTRATION_DISCOVERY_RECENT_PAGE_SIZE),
        );
      } catch (error) {
        // The recent endpoint is an acceleration path. Keep the durable
        // cursor scan healthy if an older Drive deployment has not picked up
        // the endpoint yet; the next page still guarantees eventual coverage.
        console.warn(
          'Drive recent storage discovery unavailable; continuing cursor scan',
          error,
        );
      }
    }
    const objectsByKey = new Map<string, R2ObjectLike>();
    page.objects.forEach(object => objectsByKey.set(object.key, object));
    recent.objects.forEach(object => objectsByKey.set(object.key, object));
    const discoveryObjects = Array.from(objectsByKey.values());
    const queuedDeletionPrefixes = await getQueuedDeletionPrefixes(env);
    let discovered = 0;
    for (
      let offset = 0;
      offset < discoveryObjects.length;
      offset += REGISTRATION_DISCOVERY_SQL_BATCH_SIZE
    ) {
      discovered += await discoverRegistrationPage(
        env,
        discoveryObjects.slice(
          offset,
          offset + REGISTRATION_DISCOVERY_SQL_BATCH_SIZE,
        ),
        queuedDeletionPrefixes,
      );
    }
    await compareAndSetRegistrationScanCursor(
      env,
      cursor,
      page.nextContinuationToken,
    );
    console.log(JSON.stringify({
      category: 'registration',
      event: 'storage_discovery_page_scanned',
      status: 'success',
      pageSize: page.objects.length,
      recentPageSize: recent.objects.length,
      discovered,
      hasNextPage: Boolean(page.nextContinuationToken),
    }));
    return { discovered, pageSize: page.objects.length };
  } catch (error) {
    const message = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error ?? 'unknown error');
    console.warn(
      `Scheduled registration discovery page failed: ${message}`,
      error instanceof Error ? error.stack : undefined,
    );
    return { discovered: 0, pageSize: 0 };
  }
};

const requeueRegistrationStatuses = async (env: Env, urls: string[]) => {
  const uniqueUrls = Array.from(new Set(urls
    .map(url => trimToUndefined(url))
    .filter((url): url is string => Boolean(url))));
  if (uniqueUrls.length === 0) { return 0; }
  await ensureRegistrationStatusTable(env);
  const sql = sqlForEnv(env);
  const rows = await sql`
    UPDATE worker_registration_status
    SET
      status='detected',
      error_message=NULL,
      updated_at=now()
    WHERE url = ANY(${uniqueUrls})
      OR source_url = ANY(${uniqueUrls})
    RETURNING url
  ` as unknown as Array<{ url: string }>;
  return rows.length;
};

const retryStaleProcessing = async (env: Env) => {
  const sql = sqlForEnv(env);
  const minutes = getNumber(env.STALE_PROCESSING_MINUTES, 15, {
    min: 1,
    max: 24 * 60,
  });
  const staleRows = await sql`
    UPDATE media
    SET
      transcode_status='pending',
      transcode_error='Previous processing attempt stalled; queued for retry',
      updated_at=now()
    WHERE transcode_status='processing'
      AND updated_at < now() - (${String(minutes)} || ' minutes')::interval
    RETURNING id
  ` as unknown as { id: string }[];
  // A transient Drive/connection failure can be reported after the processor
  // has already moved the row to `failed` (for example a 524 from Drive). Do
  // not leave that recoverable failure stranded until someone manually edits
  // the database; the next scheduled maintenance pass returns it to FIFO.
  const transientRows = await sql`
    UPDATE media
    SET
      transcode_status='pending',
      transcode_error='Retryable processing interruption; queued for retry',
      updated_at=now()
    WHERE transcode_status='failed'
      AND COALESCE(transcode_error, '') ~* ${
        '(source download stalled|fetch failed|processor interrupted|' +
        '(drive|storage) (put|upload|finalize) failed \\(5[0-9][0-9]\\)|' +
        'connection terminated|connection reset|econnreset|timed? out|timeout)'
      }
    RETURNING id
  ` as unknown as { id: string }[];
  await Promise.all(staleRows.map(row => logBackendActivity(env, {
    category: 'processing',
    event: 'job_requeued',
    status: 'warning',
    message: 'Stalled processing job was returned to the pending queue',
    mediaId: row.id,
  })));
  await Promise.all(transientRows.map(row => logBackendActivity(env, {
    category: 'processing',
    event: 'job_requeued',
    status: 'warning',
    message: 'Transient processing failure was returned to the pending queue',
    mediaId: row.id,
  })));
};

let registeredUploadFileMapTableReady: Promise<void> | undefined;
const ensureRegisteredUploadFileMapTable = async (env: Env) => {
  if (env.REGISTRATION_SCHEDULED === '1') return;
  if (!registeredUploadFileMapTableReady) {
    const sql = sqlForEnv(env);
    registeredUploadFileMapTableReady = sql`
      CREATE TABLE IF NOT EXISTS registered_upload_file_map (
        media_id TEXT PRIMARY KEY,
        original_file_name TEXT NOT NULL,
        stored_file_name TEXT NOT NULL,
        stored_url TEXT NOT NULL,
        source_url TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `.then(() => undefined);
  }
  try {
    await registeredUploadFileMapTableReady;
  } catch (error) {
    registeredUploadFileMapTableReady = undefined;
    throw error;
  }
};

const getRegisteredUploadFileMapRows = async (env: Env) => {
  const sql = sqlForEnv(env);
  await ensureRegisteredUploadFileMapTable(env);
  return (await sql`
    SELECT f.media_id, f.stored_url, f.source_url, f.updated_at
    FROM registered_upload_file_map f
    JOIN media m
      ON m.id=f.media_id
     AND m.url=f.stored_url
    WHERE f.stored_url<>f.source_url
    ORDER BY f.updated_at ASC, f.media_id ASC
  `) as unknown as Array<{
    media_id: string
    stored_url: string
    source_url: string
    updated_at: Date | string
  }>;
};

const getRegisteredUploadFileMapRowsByUrls = async (env: Env, urls: string[]) => {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  if (uniqueUrls.length === 0) {
    return [] as Array<{
      media_id: string
      stored_url: string
      source_url: string
      updated_at: Date | string
    }>;
  }
  const sql = sqlForEnv(env);
  await ensureRegisteredUploadFileMapTable(env);
  return (await sql`
    SELECT f.media_id, f.stored_url, f.source_url, f.updated_at
    FROM registered_upload_file_map f
    JOIN media m
      ON m.id=f.media_id
     AND m.url=f.stored_url
    WHERE f.stored_url <> f.source_url
      AND (f.stored_url = ANY(${uniqueUrls}) OR f.source_url = ANY(${uniqueUrls}))
  `) as unknown as Array<{
    media_id: string
    stored_url: string
    source_url: string
    updated_at: Date | string
  }>;
};

const repairOrphanedRegisteredUploadMaps = async (env: Env) => {
  const sql = sqlForEnv(env);
  const rows = await sql`
    SELECT f.media_id, f.original_file_name, f.source_url
    FROM registered_upload_file_map f
    LEFT JOIN media m
      ON m.id=f.media_id
     AND m.url=f.stored_url
    WHERE m.id IS NULL
  ` as unknown as Array<{
    media_id: string
    original_file_name: string
    source_url: string
  }>;
  for (const row of rows) {
    await sql`
      DELETE FROM registered_upload_file_map
      WHERE media_id=${row.media_id}
    `;
    const fileName = row.original_file_name ||
      getFileParts(keyFromStorageUrl(env, row.source_url)).fileName;
    await setRegistrationStatus(env, {
      url: row.source_url,
      sourceUrl: row.source_url,
      originalFileName: fileName,
      fileName,
      title: resolveRegistrationTitle({ originalFileName: fileName, fallbackFileName: fileName }),
      extension: getFileParts(fileName).extension,
      status: 'detected',
      errorMessage: undefined,
    });
  }
  return rows.length;
};

const upsertRegisteredUploadFileMap = async (
  env: Env,
  {
    mediaId,
    originalFileName,
    storedFileName,
    storedUrl,
    sourceUrl,
  }: {
    mediaId: string
    originalFileName: string
    storedFileName: string
    storedUrl: string
    sourceUrl: string
  },
) => {
  const sql = sqlForEnv(env);
  await ensureRegisteredUploadFileMapTable(env);
  await sql`
    INSERT INTO registered_upload_file_map (
      media_id,
      original_file_name,
      stored_file_name,
      stored_url,
      source_url
    )
    VALUES (
      ${mediaId},
      ${originalFileName},
      ${storedFileName},
      ${storedUrl},
      ${sourceUrl}
    )
    ON CONFLICT (media_id) DO UPDATE SET
      original_file_name=EXCLUDED.original_file_name,
      stored_file_name=EXCLUDED.stored_file_name,
      stored_url=EXCLUDED.stored_url,
      source_url=CASE
        WHEN registered_upload_file_map.source_url<>
          registered_upload_file_map.stored_url
          THEN registered_upload_file_map.source_url
        ELSE EXCLUDED.source_url
      END,
      updated_at=now()
  `;
};

let scanLeaseTableReady: Promise<void> | undefined;
const ensureScanLeaseTable = async (env: Env) => {
  if (env.REGISTRATION_SCHEDULED === '1') return;
  if (!scanLeaseTableReady) {
    const sql = sqlForEnv(env);
    scanLeaseTableReady = sql`
      CREATE TABLE IF NOT EXISTS worker_scan_lease (
        lock_name TEXT PRIMARY KEY,
        lease_token TEXT NOT NULL,
        lease_until TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `.then(() => undefined);
  }
  try {
    await scanLeaseTableReady;
  } catch (error) {
    scanLeaseTableReady = undefined;
    throw error;
  }
};

const acquireScanLease = async (env: Env) => {
  await ensureScanLeaseTable(env);
  const leaseToken = crypto.randomUUID();
  const sql = sqlForEnv(env);
  const rows = (await sql`
    INSERT INTO worker_scan_lease (
      lock_name,
      lease_token,
      lease_until,
      updated_at
    ) VALUES (
      'registration',
      ${leaseToken},
      now() + (${String(SCAN_LEASE_SECONDS)} || ' seconds')::interval,
      now()
    )
    ON CONFLICT (lock_name) DO UPDATE SET
      lease_token=EXCLUDED.lease_token,
      lease_until=EXCLUDED.lease_until,
      updated_at=now()
    WHERE worker_scan_lease.lease_until < now()
    RETURNING lease_token
  `) as unknown as { lease_token: string }[];
  return rows[0]?.lease_token === leaseToken ? leaseToken : undefined;
};

const renewScanLease = async (env: Env, leaseToken: string) => {
  const sql = sqlForEnv(env);
  const rows = (await sql`
    UPDATE worker_scan_lease
    SET
      lease_until=now() +
        (${String(SCAN_LEASE_SECONDS)} || ' seconds')::interval,
      updated_at=now()
    WHERE lock_name='registration'
      AND lease_token=${leaseToken}
    RETURNING lease_token
  `) as unknown as { lease_token: string }[];
  return rows[0]?.lease_token === leaseToken;
};

const releaseScanLease = async (env: Env, leaseToken: string) => {
  const sql = sqlForEnv(env);
  await sql`
    DELETE FROM worker_scan_lease
    WHERE lock_name='registration'
      AND lease_token=${leaseToken}
  `;
};

const cleanupRegisteredSourceFiles = async (
  env: Env,
  fileMaps: Array<{
    media_id: string
    stored_url: string
    source_url: string
    updated_at: Date | string
  }>,
  objectsByKey: Map<string, R2ObjectLike>,
  limit = REGISTERED_SOURCE_CLEANUP_LIMIT,
) => {
  let cleaned = 0;
  const eligible = fileMaps.filter(fileMap => {
    const sourceKey = keyFromStorageUrl(env, fileMap.source_url);
    const storedKey = keyFromStorageUrl(env, fileMap.stored_url);
    if (!sourceKey || !storedKey || sourceKey === storedKey) return false;
    const sourceObject = objectsByKey.get(sourceKey);
    const storedObject = objectsByKey.get(storedKey);
    return Boolean(
      sourceObject &&
      storedObject &&
      isDeferredSourceCleanupSafe(
        sourceObject.uploaded,
        parseDateValue(fileMap.updated_at),
      ) &&
      isExactVerifiedStorageCopy(sourceObject.size, storedObject.size),
    );
  }).slice(0, Math.max(1, limit));
  for (const fileMap of eligible) {
    const sourceKey = keyFromStorageUrl(env, fileMap.source_url);
    const storedKey = keyFromStorageUrl(env, fileMap.stored_url);
    if (!sourceKey) continue;
    try {
      await deleteObject(env, sourceKey);
      cleaned += 1;
    } catch (error) {
      console.warn('Deferred registered source cleanup failed', {
        mediaId: fileMap.media_id,
        sourceKey,
        storedKey,
        error,
      });
    }
  }
  return cleaned;
};

const startScanLeaseHeartbeat = (env: Env, leaseToken: string) => {
  let stopped = false;
  let leaseLost = false;
  let heartbeatInFlight: Promise<unknown> | undefined;
  const intervalMs = Math.max(
    10_000,
    Math.floor((SCAN_LEASE_SECONDS * 1000) / 3),
  );
  const heartbeat = () => {
    if (stopped || heartbeatInFlight) { return; }
    heartbeatInFlight = renewScanLease(env, leaseToken)
      .then(renewed => {
        if (!renewed && !stopped) {
          leaseLost = true;
          console.warn('Worker registration scan lease was lost');
        }
      })
      .catch(error => {
        if (!stopped) {
          leaseLost = true;
          console.warn('Worker registration scan lease heartbeat failed', error);
        }
      })
      .finally(() => {
        heartbeatInFlight = undefined;
      });
  };
  const timer = setInterval(heartbeat, intervalMs);
  return {
    isLost: () => leaseLost,
    stop: async () => {
    stopped = true;
    clearInterval(timer);
    await heartbeatInFlight;
    },
  };
};

let registrationScanCursorTableReady: Promise<void> | undefined;
const ensureRegistrationScanCursorTable = async (env: Env) => {
  if (env.REGISTRATION_SCHEDULED === '1') return;
  if (!registrationScanCursorTableReady) {
    const sql = sqlForEnv(env);
    registrationScanCursorTableReady = sql`
      CREATE TABLE IF NOT EXISTS worker_registration_scan_cursor (
        cursor_name TEXT PRIMARY KEY,
        continuation_token TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `.then(() => undefined);
  }
  try {
    await registrationScanCursorTableReady;
  } catch (error) {
    registrationScanCursorTableReady = undefined;
    throw error;
  }
};

const getRegistrationScanCursor = async (env: Env) => {
  await ensureRegistrationScanCursorTable(env);
  const sql = sqlForEnv(env);
  const rows = await sql`
    SELECT continuation_token
    FROM worker_registration_scan_cursor
    WHERE cursor_name='registration'
  ` as unknown as Array<{ continuation_token?: string | null }>;
  return trimToUndefined(rows[0]?.continuation_token);
};

const setRegistrationScanCursor = async (
  env: Env,
  continuationToken?: string,
) => {
  await ensureRegistrationScanCursorTable(env);
  const sql = sqlForEnv(env);
  await sql`
    INSERT INTO worker_registration_scan_cursor (
      cursor_name,
      continuation_token,
      updated_at
    ) VALUES (
      'registration',
      ${continuationToken ?? null},
      now()
    )
    ON CONFLICT (cursor_name) DO UPDATE SET
      continuation_token=EXCLUDED.continuation_token,
      updated_at=now()
  `;
};

// Alternating discovery crons can be delivered by separate isolates. Protect
// the durable cursor from a slow invocation writing an older page token after
// a newer invocation has already advanced it. A failed compare-and-set only
// causes that page to be retried; it never affects registration claims.
const compareAndSetRegistrationScanCursor = async (
  env: Env,
  expectedContinuationToken: string | undefined,
  continuationToken?: string,
) => {
  await ensureRegistrationScanCursorTable(env);
  const sql = sqlForEnv(env);
  const rows = await sql`
    UPDATE worker_registration_scan_cursor
    SET
      continuation_token=${continuationToken ?? null},
      updated_at=now()
    WHERE cursor_name='registration'
      AND continuation_token IS NOT DISTINCT FROM ${expectedContinuationToken ?? null}
    RETURNING cursor_name
  ` as unknown as Array<{ cursor_name: string }>;
  if (rows.length === 0) {
    throw new Error('Registration discovery cursor changed during scan; retrying page');
  }
};

const upsertMediaRow = async (
  env: Env,
  {
    id,
    url,
    extension,
    mediaType,
    title,
    transcodeStatus,
    transcodeError,
    aspectRatio,
    takenAt,
    takenAtNaive,
  }: {
    id: string
    url: string
    extension: string
    mediaType: 'photo' | 'video'
    title?: string
    transcodeStatus?: string
    transcodeError?: string
    aspectRatio?: number
    takenAt: string
    takenAtNaive: string
  },
) => {
  const sql = sqlForEnv(env);
  await sql`DELETE FROM media WHERE url=${url} AND id<>${id}`;
  await sql`
    INSERT INTO media (
      id,
      url,
      extension,
      media_type,
      title,
      tags,
      transcode_status,
      transcode_error,
      aspect_ratio,
      exclude_from_feeds,
      hidden,
      taken_at,
      taken_at_naive
    ) VALUES (
      ${id},
      ${url},
      ${extension},
      ${mediaType},
      ${title},
      ${[]},
      ${transcodeStatus ?? null},
      ${transcodeError ?? null},
      ${aspectRatio ?? (mediaType === 'video' ? 16 / 9 : 1.5)},
      ${false},
      ${false},
      ${takenAt},
      ${takenAtNaive}
    )
    ON CONFLICT (id) DO UPDATE SET
      url=EXCLUDED.url,
      extension=EXCLUDED.extension,
      media_type=EXCLUDED.media_type,
      title=CASE
        WHEN NULLIF(media.title, '') IS NOT NULL
          AND media.title !~ '^[0-9]{12}(?:[-_].*)?$'
          THEN media.title
        ELSE EXCLUDED.title
      END,
      transcode_status=EXCLUDED.transcode_status,
      transcode_error=EXCLUDED.transcode_error,
      aspect_ratio=EXCLUDED.aspect_ratio,
      updated_at=now()
  `;
};

// The map and media row are the same registration commit. Keep them in one
// SQL statement so a dropped connection cannot leave a map-only orphan that
// later looks safe to clean up.
const commitRegisteredMedia = async (
  env: Env,
  {
    id,
    url,
    extension,
    mediaType,
    title,
    transcodeStatus,
    transcodeError,
    aspectRatio,
    takenAt,
    takenAtNaive,
    originalFileName,
    storedFileName,
    sourceUrl,
  }: {
    id: string
    url: string
    extension: string
    mediaType: 'video' | 'photo'
    title?: string
    transcodeStatus?: string
    transcodeError?: string
    aspectRatio?: number
    takenAt: string
    takenAtNaive: string
    originalFileName: string
    storedFileName: string
    sourceUrl: string
  },
) => {
  await ensureRegisteredUploadFileMapTable(env);
  const sql = sqlForEnv(env);
  await sql`
    WITH map_upsert AS (
      INSERT INTO registered_upload_file_map (
        media_id,
        original_file_name,
        stored_file_name,
        stored_url,
        source_url
      ) VALUES (
        ${id},
        ${originalFileName},
        ${storedFileName},
        ${url},
        ${sourceUrl}
      )
      ON CONFLICT (media_id) DO UPDATE SET
        original_file_name=EXCLUDED.original_file_name,
        stored_file_name=EXCLUDED.stored_file_name,
        stored_url=EXCLUDED.stored_url,
        source_url=CASE
          WHEN registered_upload_file_map.source_url<>
            registered_upload_file_map.stored_url
            THEN registered_upload_file_map.source_url
          ELSE EXCLUDED.source_url
        END,
        updated_at=now()
      RETURNING media_id
    ),
    media_upsert AS (
      INSERT INTO media (
        id,
        url,
        extension,
        media_type,
        title,
        tags,
        transcode_status,
        transcode_error,
        aspect_ratio,
        exclude_from_feeds,
        hidden,
        taken_at,
        taken_at_naive
      )
      SELECT
        ${id},
        ${url},
        ${extension},
        ${mediaType},
        ${title ?? null},
        ${[]},
        ${transcodeStatus ?? null},
        ${transcodeError ?? null},
        ${aspectRatio ?? (mediaType === 'video' ? 16 / 9 : 1.5)},
        ${false},
        ${false},
        ${takenAt},
        ${takenAtNaive}
      FROM map_upsert
      ON CONFLICT (id) DO UPDATE SET
        url=EXCLUDED.url,
        extension=EXCLUDED.extension,
        media_type=EXCLUDED.media_type,
        title=CASE
          WHEN NULLIF(media.title, '') IS NOT NULL
            AND media.title !~ '^[0-9]{12}(?:[-_].*)?$'
            THEN media.title
          ELSE EXCLUDED.title
        END,
        transcode_status=EXCLUDED.transcode_status,
        transcode_error=EXCLUDED.transcode_error,
        aspect_ratio=EXCLUDED.aspect_ratio,
        updated_at=now()
      RETURNING id
    )
    SELECT id FROM media_upsert
  `;
  // URL cleanup is deliberately after the atomic commit. If this maintenance
  // query fails, the committed source remains protected and can be retried.
  await sql`DELETE FROM media WHERE url=${url} AND id<>${id}`.catch(error => {
    console.warn('Duplicate media URL cleanup deferred after safe commit', {
      mediaId: id,
      url,
      error,
    });
  });
};

const scanAndRegisterWithLease = async (
  env: Env,
  leaseToken: string | undefined,
  {
    waitUntil,
    assertLease,
  }: {
    waitUntil?: (promise: Promise<unknown>) => void
    assertLease?: () => void
  } = {},
) => {
  await ensureRegisteredUploadFileMapTable(env);
  await ensureRegistrationStatusTable(env);
  // Activity records are valuable diagnostics, but a dropped observability
  // connection must never hold the durable registration queue hostage. When
  // the scheduled runtime provides waitUntil, keep each write alive there;
  // otherwise let the promise settle in the background for direct callers.
  const observe = (operation: Promise<unknown>) => {
    if (waitUntil) {
      waitUntil(operation);
    } else {
      void operation;
    }
  };
  // These maintenance passes repair metadata, but they are not allowed to
  // abort the FIFO registration pass when a transient pooler connection is
  // dropped. The queue rows remain durable and the next scan can retry the
  // maintenance work.
  const runMaintenance = async (
    name: string,
    operation: () => Promise<unknown>,
  ) => {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          operation(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(
              new Error(
                `Registration maintenance ${name} exceeded ${REGISTRATION_MAINTENANCE_TIMEOUT_MS}ms`,
              ),
            ), REGISTRATION_MAINTENANCE_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timer) { clearTimeout(timer); }
      }
    } catch (error) {
      console.warn(`Registration maintenance ${name} failed; continuing scan`, error);
      observe(logBackendActivity(env, {
        category: 'orchestrator',
        event: 'registration_maintenance_failed',
        status: 'warning',
        message: `Registration maintenance ${name} failed; scan continued`,
        details: {
          operation: name,
          error: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => undefined));
    }
  };
  // Stale claims are reselected by the FIFO pass itself. Defer the three
  // broad recovery UPDATEs to the manual maintenance route on scheduled
  // Free-plan invocations; they can consume the entire 10 ms CPU allowance.
  if (env.REGISTRATION_SCHEDULED !== '1') {
    await runMaintenance('clear_stale_statuses', () => clearStaleRegistrationStatuses(env));
  }
  // The stale registration update is the only maintenance step required to
  // make the FIFO queue recoverable. The remaining cleanup queries can scan
  // large tables; run them best-effort after the queue has been dispatched so
  // they can never hold the registration lease or the scheduled event open.

  const configuredRegisterBatchSize = getNumber(env.REGISTER_BATCH_SIZE, 2, {
    min: 1,
    max: 10,
  });
  const configuredMaxRegisterPasses = getNumber(env.MAX_REGISTER_PASSES, 2, {
    min: 1,
    max: 10,
  });
  // Use the existing panel-backed queue settings directly. They are loaded
  // from processing_configuration before the scheduled scan starts.
  const registerBatchSize = configuredRegisterBatchSize;
  const maxRegisterPasses = configuredMaxRegisterPasses;
  const staleRegistrationMinutes = getNumber(env.STALE_REGISTRATION_MINUTES, 15, {
    min: 1,
    max: 24 * 60,
  });

  let registered = 0;
  let registrationRemaining = 0;
  let missingProcessingSources = 0;
  let passes = 0;
  const attemptedRegistrationKeys = new Set<string>();
  const isScheduledRegistration = env.REGISTRATION_SCHEDULED === '1';
  const isProcessorPull = env.REGISTRATION_PROCESSOR_PULL === '1';
  if (isScheduledRegistration && !isProcessorPull) {
    // The atomic SKIP LOCKED claim is the concurrency fence. A processor
    // heartbeat query here used one more fresh database connection before
    // every claim and caused the Free-plan cron to die before registration.
    // Only the explicit processor-only setting suppresses the Worker; when
    // both owners are allowed they safely claim different rows concurrently.
    if (env.PROCESSOR_ONLY_REGISTRATION === '1') {
      return {
        registered: 0,
        registrationPasses: 0,
        registrationRemaining: 0,
        pendingVideos: 0,
        missingProcessingSources: 0,
        scanSkipped: true,
        registrationProcessorOnly: true,
      };
    }
  }
  // On the Free plan, scheduled invocations have only 10 ms of CPU. Claim one
  // durable FIFO row atomically instead of loading the full queue first.
  const queueClaim = isScheduledRegistration
    ? await claimRegistrationQueueRow(env)
    : undefined;
  const claimedRegistrationRow = queueClaim?.row;
  const scheduledQueueRows = claimedRegistrationRow
    ? [claimedRegistrationRow]
    : undefined;
  const hasScheduledQueue = Boolean(claimedRegistrationRow);
  if (claimedRegistrationRow) {
    observe(logBackendActivity(env, {
      category: 'registration',
      event: 'registration_claimed',
      status: 'info',
      message: `Claimed ${claimedRegistrationRow.file_name || claimedRegistrationRow.url}`,
      details: { url: claimedRegistrationRow.url },
    }).catch(() => undefined));
  }
  // A scheduled invocation without a claim must finish immediately. Discovery
  // owns the storage cursor on its separate cron, so the registration hot path
  // never performs a bucket list or discovery SQL when the queue is empty or a
  // different invocation owns the current claim.
  if (isScheduledRegistration && !hasScheduledQueue) {
    return {
      registered: 0,
      registrationPasses: 0,
      registrationRemaining: 0,
      pendingVideos: 0,
      missingProcessingSources: 0,
      scanSkipped: false,
    };
  }
  if (env.REGISTRATION_PROCESSOR_ONLY === '1' && !hasScheduledQueue) {
    return {
      registered: 0,
      registrationPasses: 0,
      registrationRemaining: 0,
      pendingVideos: 0,
      missingProcessingSources: 0,
      scanSkipped: false,
    };
  }
  const inventoryCursor = (!isScheduledRegistration || !hasScheduledQueue)
    ? await getRegistrationScanCursor(env)
    : undefined;
  const listedObjectsPagePromise = hasScheduledQueue
    ? Promise.resolve({
      objects: (scheduledQueueRows || []).map(row => {
        const sourceUrl = trimToUndefined(row.source_url) || trimToUndefined(row.url) || '';
        const sourceKey = sourceUrl ? keyFromStorageUrl(env, sourceUrl) : '';
        return {
          key: sourceKey,
          uploaded: parseDateValue(row.uploaded_at),
        };
      }).filter(object => Boolean(object.key)),
      nextContinuationToken: undefined,
    } satisfies StorageListPage)
    : listStoragePage(
      env,
      inventoryCursor,
      isScheduledRegistration ? Math.min(registerBatchSize * maxRegisterPasses, 8) : undefined,
    );
  let inventoryCursorPersisted = false;
  let deferredFileMaps: Array<{
    media_id: string
    stored_url: string
    source_url: string
    updated_at: Date | string
  }> = [];
  let deferredObjectsByKey = new Map<string, R2ObjectLike>();

  for (let pass = 0; pass < maxRegisterPasses; pass += 1) {
    // Do not fan out direct Postgres connections here.  A large backlog used
    // to make this single scan open several pooler connections at once, which
    // can terminate the scan before any item reaches `registering`.
    // Storage listing can overlap the first query, but database work remains
    // deliberately serial and bounded regardless of backlog size.
    const storagePage = await listedObjectsPagePromise;
    const queuedDeletionPrefixes = hasScheduledQueue
      ? new Set<string>()
      : await getQueuedDeletionPrefixes(env);
    const listedObjects = storagePage.objects.filter(object =>
      !Array.from(queuedDeletionPrefixes).some(prefix =>
        deletionKeyMatchesPrefix(object.key, prefix)));
    const objectsByKey = new Map(
      listedObjects.map(object => [object.key, object]),
    );
    deferredObjectsByKey = objectsByKey;
    const listedObjectUrls = listedObjects.map(object =>
      urlForKey(env, object.key));
    const hintRows = await getPendingUploadRegistrationHints(env);
    const registrationRows = hasScheduledQueue
      ? (scheduledQueueRows || [])
      : isScheduledRegistration
        ? await getRegistrationStatusRowsByUrls(env, listedObjectUrls)
        : await getRegistrationStatusRows(env);
    const queueCandidateIds = hasScheduledQueue
      ? await Promise.all(registrationRows.map(async row => {
        const existingId = trimToUndefined(row.media_id);
        if (existingId) { return existingId; }
        const sourceUrl = trimToUndefined(row.source_url) || trimToUndefined(row.url);
        const sourceKey = sourceUrl ? keyFromStorageUrl(env, sourceUrl) : '';
        return sourceKey
          ? mediaIdForObject(env, sourceKey, parseDateValue(row.uploaded_at))
          : undefined;
      }))
      : [];
    // Keep collision protection for scheduled work without loading the whole
    // media table. A targeted ID lookup preserves the existing idempotency
    // behavior while keeping the query bounded by the queue slice.
    const rows = hasScheduledQueue
      ? await getMediaRowsByIds(
        env,
        queueCandidateIds.filter((id): id is string => Boolean(id)),
      )
      : isScheduledRegistration
        ? await getMediaRowsByUrls(env, listedObjectUrls)
        : await getMediaRows(env);
    const registeredFileMaps = hasScheduledQueue
      ? []
      : isScheduledRegistration
        ? await getRegisteredUploadFileMapRowsByUrls(env, listedObjectUrls)
        : await getRegisteredUploadFileMapRows(env);
    deferredFileMaps = registeredFileMaps;
    // The status table is the durable FIFO queue. Rehydrate queued source
    // objects that are outside this inventory page without listing the whole
    // bucket again; their size is fetched only if they are actually claimed.
    registrationRows.forEach(row => {
      if (row.status !== 'detected' && row.status !== 'registering') {
        return;
      }
      const sourceUrl = trimToUndefined(row.source_url) || trimToUndefined(row.url);
      const sourceKey = sourceUrl ? keyFromStorageUrl(env, sourceUrl) : '';
      if (
        !sourceKey ||
        Array.from(queuedDeletionPrefixes).some(prefix =>
          deletionKeyMatchesPrefix(sourceKey, prefix)) ||
        objectsByKey.has(sourceKey)
      ) {
        return;
      }
      objectsByKey.set(sourceKey, {
        key: sourceKey,
        uploaded: parseDateValue(row.uploaded_at),
      });
    });
    const objects = Array.from(objectsByKey.values());
    if (pass === 0) {
      // A partial inventory cannot prove that an unrelated processing source
      // is missing. Only reconcile when one page is the complete inventory.
      if (!hasScheduledQueue && !inventoryCursor && !storagePage.nextContinuationToken) {
        missingProcessingSources = await reconcileMissingProcessingSources(
          env,
          rows,
          new Set(listedObjects.map(object => object.key)),
        );
      }
    }
    // Source deletion is housekeeping, not part of the registration lease.
    // Keep these source URLs protected from re-registration while cleanup is
    // deferred to a small, bounded waitUntil task below.
    const registeredSourceUrls = new Set(
      registeredFileMaps.map(fileMap => fileMap.source_url),
    );
    const registrationRowsByUrl = await buildRegistrationStatusLookup(
      env,
      registrationRows,
    );
    const protectedRegistrationDestinationUrls = new Set<string>();
    if (!hasScheduledQueue) await Promise.all(registrationRows.map(async row => {
      if (!trimToUndefined(row.media_id)) { return; }
      const sourceUrl = trimToUndefined(row.source_url) || trimToUndefined(row.url);
      if (!sourceUrl) { return; }
      const sourceKey = keyFromStorageUrl(env, sourceUrl);
      if (!sourceKey || !objectsByKey.has(sourceKey)) { return; }
      const expectedUrl = await getExpectedRegistrationUrlForStatusRow(env, row)
        .catch(() => undefined);
      if (expectedUrl && isProtectedRegistrationDestination({
        objectUrl: expectedUrl,
        sourceUrl,
        expectedUrl,
        sourceExists: true,
      })) {
        protectedRegistrationDestinationUrls.add(expectedUrl);
      }
    }));

    const knownUrls = new Set<string>();
    rows.forEach(row => {
      knownUrls.add(row.url);
      if (row.poster_url) { knownUrls.add(row.poster_url); }
      if (row.preview_url) { knownUrls.add(row.preview_url); }
    });

    const pending = objects.filter(object => {
      const { fileNameBase, extension } = getFileParts(object.key);
      if (!MEDIA_EXTENSIONS.has(extension)) { return false; }
      if (GENERATED_MEDIA_SUFFIX_REGEX.test(fileNameBase)) { return false; }
      const objectUrl = urlForKey(env, object.key);
      if (knownUrls.has(objectUrl) || registeredSourceUrls.has(objectUrl)) {
        return false;
      }
      // A failed or not-yet-visible copy may already exist under the generated
      // name. While its original source still exists, only retry the source;
      // never register that generated destination as a second upload.
      if (protectedRegistrationDestinationUrls.has(objectUrl)) { return false; }
      return true;
    });

    const pendingObjectByKey = new Map<string, R2ObjectLike>();
    pending.forEach(object => {
      pendingObjectByKey.set(object.key, object);
    });

    const now = Date.now();
    const isStaleRegistration = (row?: RegistrationStatusRow) => {
      if (row?.status !== 'registering') { return false; }
      const updatedAt = parseDateValue(row.updated_at);
      return !updatedAt ||
        now - updatedAt.getTime() >= staleRegistrationMinutes * 60 * 1000;
    };
    const readyRegistrationKeys = hasScheduledQueue
      ? new Set<string>()
      : await findReadyRegistrationKeys(
        env,
        registrationRows,
        pendingObjectByKey,
      );
    if (readyRegistrationKeys.size > 0) {
      observe(logBackendActivity(env, {
        category: 'registration',
        event: 'registration_destination_ready',
        status: 'info',
        message: `Detected ${readyRegistrationKeys.size} completed Drive cop${readyRegistrationKeys.size === 1 ? 'y' : 'ies'} ready to commit`,
        details: { count: readyRegistrationKeys.size },
      }).catch(error => {
        console.warn('Unable to log ready registration destinations', error);
      }));
    }
    const deferredRegistrationKeys = new Set(
      pending
        .filter(object => {
          const row = registrationRowsByUrl.get(urlForKey(env, object.key));
          return row?.status === 'registering' &&
            !isStaleRegistration(row) &&
            !readyRegistrationKeys.has(object.key);
        })
        .map(object => object.key),
    );
    for (const hint of hintRows) {
      const hintKey = keyFromStorageUrl(env, hint.url);
      if (!hintKey) { continue; }

      const canonicalHintUrl = urlForKey(env, hintKey);
      if (canonicalHintUrl !== hint.url) {
        await replaceUploadRegistrationHintUrl(
          env,
          hint.url,
          canonicalHintUrl,
        ).catch(() => undefined);
      }

      const { fileName, fileNameBase, extension } = getFileParts(hintKey);
      if (!MEDIA_EXTENSIONS.has(extension)) { continue; }
      if (GENERATED_MEDIA_SUFFIX_REGEX.test(fileNameBase)) { continue; }

      const uploadedAtDate =
        parseDateValue(hint.updated_at) ??
        parseDateValue(hint.created_at);
      const uploadedAt = uploadedAtDate?.toISOString();
      const existingRegistration =
        registrationRowsByUrl.get(canonicalHintUrl) ||
        registrationRowsByUrl.get(hint.url);
      const originalFileName =
        resolveRegistrationOriginalFileName({
          hint,
          statusRow: existingRegistration,
          fallbackFileName: fileName,
        }) || fileName;
      const title = resolveRegistrationTitle({
        originalFileName,
        fallbackFileName: fileName,
      });
      const sourceUrl = resolveRegistrationSourceUrl(
        existingRegistration,
        canonicalHintUrl,
      );

      if (knownUrls.has(canonicalHintUrl)) {
        await clearTrackedRegistration(env, [
          canonicalHintUrl,
          hint.url,
          sourceUrl,
        ]).catch(() => undefined);
        continue;
      }

      if (pendingObjectByKey.has(hintKey)) {
        continue;
      }

      const recoveredRegistrationKey = await getExpectedRegistrationKeyForHint(
        env,
        hintKey,
      );
      // A generated destination can be left behind by an interrupted copy.
      // Existence alone is not proof that the object is complete; require an
      // exact source/destination size match before recovering the hint.
      const recoveredSourceSize = recoveredRegistrationKey
        ? await storageObjectSize(env, hintKey).catch(() => undefined)
        : undefined;
      const recoveredDestinationSize = recoveredRegistrationKey
        ? await storageObjectSize(env, recoveredRegistrationKey).catch(() => undefined)
        : undefined;
      if (
        recoveredRegistrationKey &&
        isExactVerifiedStorageCopy(recoveredSourceSize, recoveredDestinationSize)
      ) {
        const recoveredRegistrationUrl = urlForKey(env, recoveredRegistrationKey);
        await replaceRegistrationStatusUrl(
          env,
          canonicalHintUrl,
          recoveredRegistrationUrl,
        ).catch(() => undefined);
        await replaceUploadRegistrationHintUrl(
          env,
          canonicalHintUrl,
          recoveredRegistrationUrl,
        ).catch(() => undefined);
        pendingObjectByKey.set(recoveredRegistrationKey, {
          key: recoveredRegistrationKey,
          uploaded: uploadedAtDate,
        });
        continue;
      }

      let finalizeErrorMessage: string | undefined;
      if (isDriveStorageEnabled(env)) {
        try {
          await finalizeDriveUpload(env, hintKey);
        } catch (error) {
          finalizeErrorMessage =
            error instanceof Error
              ? error.message
              : String(error ?? 'Drive finalize failed');
        }
      }

      if (await storageObjectExists(env, hintKey)) {
        pendingObjectByKey.set(hintKey, {
          key: hintKey,
          uploaded: uploadedAtDate,
        });
        continue;
      }

      const shouldMarkError = Boolean(
        finalizeErrorMessage ||
        existingRegistration?.status === 'error' ||
        (
          uploadedAtDate
            ? now - uploadedAtDate.getTime() >= staleRegistrationMinutes * 60 * 1000
            : true
        ),
      );
      await setRegistrationStatus(env, {
        url: canonicalHintUrl,
        fileName: originalFileName,
        uploadedAt,
        status: shouldMarkError ? 'error' : 'detected',
        sourceUrl,
        originalFileName,
        title,
        extension,
        errorMessage: shouldMarkError
          ? (
            finalizeErrorMessage
              ? `${MISSING_UPLOAD_ERROR_PREFIX} after finalize attempt: ${finalizeErrorMessage}`
              : `${MISSING_UPLOAD_ERROR_PREFIX}; finalize or re-upload the file`
          )
          : undefined,
      });
    }

    const pendingUploads = Array.from(pendingObjectByKey.values());

    await syncDetectedStatuses(env, pendingUploads, registrationRowsByUrl);
    if (pass === 0 && !inventoryCursorPersisted && !hasScheduledQueue) {
      // Advance the cursor only after this page's detected rows are durable.
      // If the Worker is reclaimed earlier, the same page is safely retried.
      await setRegistrationScanCursor(
        env,
        storagePage.nextContinuationToken,
      );
      inventoryCursorPersisted = true;
    }
    registrationRemaining = pendingUploads.length;
    passes += 1;
    if (pendingUploads.length === 0) { break; }

    const batch = selectOldestRegistrationBatch(
      pendingUploads,
      attemptedRegistrationKeys,
      registerBatchSize,
      deferredRegistrationKeys,
    );
    if (batch.length === 0) {
      registrationRemaining = pendingUploads.length;
      break;
    }
    // Keep the selected rows as `detected` until each file has an allocated
    // media ID and is actually entering its copy/commit attempt. Marking the
    // whole batch as `registering` first left null-ID rows looking stalled if
    // the Worker was reclaimed between the batch write and the first file.
    const hintsByUrl = await getUploadRegistrationHints(
      env,
      batch.map(object => urlForKey(env, object.key)),
    );
    for (const object of batch) {
      assertLease?.();
      if (leaseToken && !await renewScanLease(env, leaseToken)) {
        throw new Error('Worker registration scan lease was lost');
      }
      attemptedRegistrationKeys.add(object.key);
      const sourceUrl = urlForKey(env, object.key);
      let registrationUrl = sourceUrl;
      const { fileName, extension } = getFileParts(object.key);
      const sourceFileName = fileName;
      const sourceUploadedAt = object.uploaded?.toISOString();
      const uploadHint = hintsByUrl.get(sourceUrl);
      const existingRegistration = registrationRowsByUrl.get(sourceUrl);
      const persistedSourceUrl = resolveRegistrationSourceUrl(
        existingRegistration,
        sourceUrl,
      );
      const originalFileName =
        resolveRegistrationOriginalFileName({
          hint: uploadHint,
          statusRow: existingRegistration,
          fallbackFileName: sourceFileName,
        }) || sourceFileName;
      const registrationTitle = resolveRegistrationTitle({
        originalFileName,
        fallbackFileName: sourceFileName,
      });
      let mediaId = trimToUndefined(existingRegistration?.media_id);
      let registrationCommitted = false;
      let registrationPhase: 'allocating' | 'preparing' | 'committing' =
        'allocating';
      try {
        mediaId = mediaId || await findAvailableMediaId(
          attempt => mediaIdForObject(
            env,
            object.key,
            object.uploaded,
            attempt,
          ),
          new Set(rows.map(row => row.id)),
        );
        const registrationKey = buildRegistrationKey(
          env,
          object.key,
          mediaId,
          extension,
        );
        // Persist the deterministic ID before the first Drive request. If a
        // Free-plan invocation is reclaimed during a HEAD/copy, the next
        // claim can resume the exact destination instead of rotating an
        // opaque `registering` row with a null ID.
        await setRegistrationStatus(env, {
          url: sourceUrl,
          fileName: originalFileName,
          uploadedAt: sourceUploadedAt,
          status: 'registering',
          sourceUrl: persistedSourceUrl,
          originalFileName,
          title: registrationTitle,
          extension,
          mediaId,
        });
        observe(logBackendActivity(env, {
          category: 'registration',
          event: 'registration_id_allocated',
          status: 'info',
          message: `Allocated registration ID for ${originalFileName}`,
          mediaId,
          details: { phase: 'preparing', sourceUrl },
        }).catch(() => undefined));
        // Rows rehydrated from the durable queue may be outside the current
        // inventory page and therefore have no listed size. Fetch the source
        // size once before validating an existing generated destination;
        // comparing against undefined falsely kept retries waiting forever.
        const sourceSize = object.size ?? await storageObjectSize(env, object.key);
        const targetRegistrationUrl = urlForKey(env, registrationKey);
        const existingMediaForId = rows.find(row => row.id === mediaId);
        const targetRecordedAsRegistered =
          registrationKey !== object.key &&
          (
            existingMediaForId?.url === targetRegistrationUrl ||
            knownUrls.has(targetRegistrationUrl)
          );
        const shouldVerifyExistingTarget =
          shouldVerifyExistingRegistrationDestination({
            sourceKey: object.key,
            destinationKey: registrationKey,
            mediaId,
            trackedMediaId: trimToUndefined(existingRegistration?.media_id),
            targetRecordedAsRegistered,
          });
        const listedTargetSize = objectsByKey.get(registrationKey)?.size;
        const recordedTargetSize = shouldVerifyExistingTarget
          ? isExactVerifiedStorageCopy(sourceSize, listedTargetSize)
            ? listedTargetSize
            : await waitForVerifiedStorageCopy({
              sourceSize,
              readDestinationSize: () => storageObjectSize(env, registrationKey),
              attempts: isDriveStorageEnabled(env)
                ? DRIVE_RETRY_TARGET_VISIBILITY_ATTEMPTS
                : 1,
              delayMs: isDriveStorageEnabled(env)
                ? DRIVE_COPY_VISIBILITY_DELAY_MS
                : 0,
            })
          : undefined;
        const targetAlreadyRegistered = shouldVerifyExistingTarget &&
          isExactVerifiedStorageCopy(sourceSize, recordedTargetSize);
        if (shouldWaitForTrackedRegistrationDestination({
          shouldVerifyExistingTarget,
          registrationStatus: existingRegistration?.status,
          targetAlreadyRegistered,
          // A fresh row may still represent a Drive copy in progress. Once
          // its status is stale, retry the idempotent copy instead of waiting
          // forever for a destination that may never exist.
          retryStale: isStaleRegistration(existingRegistration),
        })) {
          throw new Error(
            `Copied destination is not readable in storage: ${registrationKey}`,
          );
        }
        const shouldUpsertMediaRow = existingMediaForId?.url !== targetRegistrationUrl;
        if (targetAlreadyRegistered) {
          registrationUrl = targetRegistrationUrl;
        }
        if (registrationKey !== object.key) {
          registrationUrl = targetRegistrationUrl;
        }
        const registeredFileName = getFileParts(registrationUrl).fileName;
        observe(logBackendActivity(env, {
          category: 'registration',
          event: 'registration_started',
          status: 'info',
          message: `Registering ${originalFileName}`,
          mediaId,
          details: {
            phase: 'preparing',
            fileName: originalFileName,
            extension,
            uploadedAt: sourceUploadedAt,
            sourceUrl,
            targetUrl: registrationUrl,
            sourceSize,
            storageProvider: detectStorageProvider(env),
          },
        }).catch(error => {
          console.warn('Unable to log registration start', error);
        }));
        registrationPhase = 'preparing';
        observe(logBackendActivity(env, {
          category: 'registration',
          event: 'registration_commit_started',
          status: 'info',
          message: `Preparing commit for ${originalFileName}`,
          mediaId,
          details: { phase: registrationPhase, sourceUrl },
        }).catch(() => undefined));
        await runSafeRegistrationCommit({
          // Keep the original object until the generated-name destination is
          // verified and the media row plus filename map are both committed.
          prepareDestination: async () => {
            if (registrationKey !== object.key && !targetAlreadyRegistered) {
              await copyAndVerifyObject(
                env,
                object.key,
                registrationKey,
                sourceSize,
              );
            }
          },
          commitRegistration: async () => {
            registrationPhase = 'committing';
            assertLease?.();
            if (shouldUpsertMediaRow) {
              const mediaType = VIDEO_EXTENSIONS.has(extension) ? 'video' : 'photo';
              const uploadedAt = object.uploaded?.toISOString() || new Date().toISOString();
              await commitRegisteredMedia(env, {
                id: mediaId,
                url: registrationUrl,
                extension,
                mediaType,
                title: registrationTitle,
                transcodeStatus: mediaType === 'video' ? 'pending' : undefined,
                transcodeError: mediaType === 'video'
                  ? 'Queued for background processing'
                  : undefined,
                aspectRatio: mediaType === 'video' ? 16 / 9 : 1.5,
                takenAt: uploadedAt,
                takenAtNaive: toNaivePostgresString(uploadedAt),
                originalFileName,
                storedFileName: registeredFileName,
                sourceUrl,
              });
            } else {
              await upsertRegisteredUploadFileMap(env, {
                mediaId,
                originalFileName,
                storedFileName: registeredFileName,
                storedUrl: registrationUrl,
                sourceUrl,
              });
            }
            // Everything after this point is housekeeping. If one of those
            // cleanup calls loses its database connection, the committed
            // media/map must never be reported as a failed registration.
            registrationCommitted = true;
          },
          cleanupSource: async () => {
            if (registrationUrl !== sourceUrl) {
              const cleanup = deleteObject(env, object.key).catch(error => {
                console.warn('Source cleanup deferred after safe registration', {
                  sourceUrl,
                  registrationUrl,
                  cleanupError: error,
                });
              });
              // Source deletion is post-commit housekeeping. Do not make a
              // successful database registration hold the scan lease while a
              // Drive delete endpoint is slow; the registered file map makes
              // this cleanup safely retryable on a later maintenance pass.
              if (waitUntil) {
                waitUntil(cleanup);
                return;
              }
              await cleanup;
            }
          },
          onCleanupError: cleanupError => {
            console.warn('Source cleanup deferred after safe registration', {
              sourceUrl,
              registrationUrl,
              cleanupError,
            });
          },
        });
        const trackingUrls = [
          registrationUrl,
          sourceUrl,
          persistedSourceUrl,
        ].filter((url): url is string => Boolean(url));
        const trackingCleanup = clearRegistrationTrackingAfterSuccess(env, {
          mediaId,
          urls: trackingUrls,
        }).catch(async error => {
          console.warn(
            'Registration committed but tracking cleanup will be retried',
            { mediaId, sourceUrl, error },
          );
          // Keep a durable non-claimable marker if deletion of the tracking
          // row itself failed. The next maintenance pass can remove it,
          // while the registration queue will not copy the file again.
          await setRegistrationStatus(env, {
            url: sourceUrl,
            fileName: originalFileName,
            uploadedAt: sourceUploadedAt,
            status: 'registered',
            sourceUrl: persistedSourceUrl,
            originalFileName,
            title: registrationTitle,
            extension,
            mediaId,
          }).catch(housekeepingError => {
            console.warn('Unable to persist committed registration marker', {
              mediaId,
              sourceUrl,
              error: housekeepingError,
            });
          });
        });
        if (waitUntil) {
          waitUntil(trackingCleanup);
        } else {
          await trackingCleanup;
        }
        const hintCleanup = clearUploadRegistrationHints(env, [
          ...trackingUrls,
        ]).catch(error => {
          console.warn('Registration hint cleanup deferred after commit', {
            mediaId,
            sourceUrl,
            error,
          });
        });
        if (waitUntil) {
          waitUntil(hintCleanup);
        } else {
          await hintCleanup;
        }
        observe(logBackendActivity(env, {
          category: 'registration',
          event: 'media_registered',
          status: 'success',
          message: `Registered ${originalFileName}`,
          mediaId,
          details: {
            phase: 'completed',
            fileName: originalFileName,
            extension,
            uploadedAt: sourceUploadedAt,
            sourceUrl,
            storedUrl: registrationUrl,
            storageProvider: detectStorageProvider(env),
          },
        }).catch(error => {
          console.warn('Unable to log registration completion', error);
        }));
        const revalidation = revalidateMediaPanel(env, mediaId).catch(error => {
          console.error('Media panel revalidation failed after registration', {
            mediaId,
            sourceUrl,
            registrationUrl,
            error,
          });
        });
        if (waitUntil) {
          waitUntil(revalidation);
        } else {
          await revalidation;
        }
        knownUrls.add(registrationUrl);
        registered += 1;
      } catch (error) {
        if (registrationCommitted) {
          // The atomic media/map commit already succeeded. Do not overwrite
          // that success with an error because post-commit housekeeping failed.
          console.warn('Registration committed; post-commit housekeeping deferred', {
            mediaId,
            sourceUrl,
            error,
          });
          knownUrls.add(registrationUrl);
          registered += 1;
          continue;
        }
        const isRecoverableCopyDelay =
          isDriveStorageEnabled(env) &&
          isRecoverableDriveCopyError(error);
        const logRegistrationIssue = isRecoverableCopyDelay
          ? console.warn
          : console.error;
        logRegistrationIssue(
          isRecoverableCopyDelay
            ? 'Drive copy still completing for object'
            : 'Registration failed for object', {
          sourceUrl,
          registrationUrl,
          error,
        });
        await setRegistrationStatus(env, {
          url: sourceUrl,
          fileName: originalFileName,
          uploadedAt: sourceUploadedAt,
          status: isRecoverableCopyDelay ? 'registering' : 'error',
          sourceUrl: persistedSourceUrl,
          originalFileName,
          title: registrationTitle,
          extension,
          errorMessage: isRecoverableCopyDelay
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error ?? 'Registration failed'),
          touchUpdatedAt: isRecoverableCopyDelay ? false : undefined,
        }).catch(() => undefined);
        observe(logBackendActivity(env, {
          category: 'registration',
          event: isRecoverableCopyDelay
            ? 'registration_waiting_for_storage'
            : 'registration_failed',
          status: isRecoverableCopyDelay ? 'warning' : 'error',
          message: isRecoverableCopyDelay
            ? `Waiting for Drive copy of ${originalFileName}`
            : error instanceof Error
              ? error.message
              : String(error ?? 'Registration failed'),
          mediaId,
          details: {
            phase: registrationPhase,
            fileName: originalFileName,
            extension,
            uploadedAt: sourceUploadedAt,
            sourceUrl,
            targetUrl: registrationUrl,
            error: error instanceof Error ? error.message : String(error),
          },
        }).catch(logError => {
          console.warn('Unable to log registration failure', logError);
        }));
        continue;
      }
    }

    registrationRemaining = Math.max(pendingUploads.length - batch.length, 0);
    if (batch.length === 0) { break; }
  }

  if (deferredFileMaps.length > 0 && env.REGISTRATION_SCHEDULED !== '1') {
    // A scheduled invocation must keep housekeeping bounded independently of
    // the registration scan. One delete is enough to make steady progress;
    // manual maintenance may use the larger cleanup limit.
    const cleanupLimit = waitUntil ? 1 : REGISTERED_SOURCE_CLEANUP_LIMIT;
    const cleanup = cleanupRegisteredSourceFiles(
      env,
      deferredFileMaps,
      deferredObjectsByKey,
      cleanupLimit,
    ).catch(error => {
      console.warn('Deferred source cleanup task failed', error);
    });
    if (waitUntil) {
      waitUntil(cleanup);
    } else {
      void cleanup;
    }
  }

  // Start broad cleanup only for direct/manual scans. A scheduled invocation
  // on the free CPU tier must reserve its tiny CPU budget for registration;
  // these table-wide repairs are non-critical and can be run from the manual
  // maintenance endpoint without taking the cron path down.
  const deferredMaintenance = [
    ['repair_orphaned_maps', () => repairOrphanedRegisteredUploadMaps(env)],
    ['clear_resolved_statuses', () => clearResolvedRegistrationStatuses(env)],
    ['clear_old_statuses', () => clearOldCompletedRegistrationStatuses(env)],
    ['retry_stale_processing', () => retryStaleProcessing(env)],
  ] as const;
  for (const [name, operation] of deferredMaintenance) {
    if (!waitUntil) {
      await runMaintenance(name, operation);
    }
  }

  return {
    registered,
    registrationPasses: passes,
    registrationRemaining,
    // The scheduled queue path must not spend another fresh Postgres
    // connection on a cosmetic processing count after the registration work.
    pendingVideos: isScheduledRegistration ? 0 : await countPendingVideos(env),
    missingProcessingSources,
    scanSkipped: false,
  };
};

const scanAndRegister = async (
  env: Env,
  { waitUntil }: { waitUntil?: (promise: Promise<unknown>) => void } = {},
) => {
  // Scheduled scans use the atomic row claim as their concurrency guard. The
  // global lease would add three more fresh Postgres clients around the claim
  // and consume the same 10 ms CPU budget. Manual scans retain the lease.
  const scheduledRegistration = env.REGISTRATION_SCHEDULED === '1';
  const leaseToken = scheduledRegistration
    ? undefined
    : await acquireScanLease(env);
  if (!scheduledRegistration && !leaseToken) {
    return {
      registered: 0,
      registrationPasses: 0,
      registrationRemaining: 0,
      pendingVideos: await countPendingVideos(env),
      missingProcessingSources: 0,
      scanSkipped: true,
    };
  }
  const scanEnv = {
    ...env,
    REGISTRATION_SCAN_DEADLINE_AT: String(
      Date.now() + SCHEDULED_SCAN_DEADLINE_MS,
    ),
  };
  const leaseHeartbeat = leaseToken
    ? startScanLeaseHeartbeat(env, leaseToken)
    : undefined;
  try {
    return await scanAndRegisterWithLease(scanEnv, leaseToken, {
      waitUntil,
      assertLease: () => {
        if (leaseHeartbeat?.isLost()) {
          throw new Error('Worker registration scan lease was lost');
        }
      },
    });
  } finally {
    if (leaseHeartbeat) {
      await leaseHeartbeat.stop().catch(error => {
        console.warn('Failed to stop worker scan lease heartbeat', error);
      });
    }
    if (leaseToken) {
      await releaseScanLease(env, leaseToken).catch(error => {
        console.warn('Failed to release worker scan lease', error);
      });
    }
  }
};

const claimVideoJobs = async (env: Env, limit: number) => {
  // Reclaim abandoned leases even when the scheduled scan has not run yet.
  // Active processors keep updated_at fresh through their heartbeat requests.
  await retryStaleProcessing(env);

  const sql = sqlForEnv(env);
  const rows = (await sql`
    WITH cte AS (
      SELECT id
      FROM media
      WHERE transcode_status='pending'
        AND media_type='video'
      ORDER BY created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE media p
    SET transcode_status='processing', updated_at=now()
    WHERE p.id IN (SELECT id FROM cte)
    RETURNING p.id, p.url, p.extension, p.transcode_error
  `) as unknown as ClaimJobRow[];

  const jobs = await Promise.all(rows.map(async row => {
    const sourceKey = keyFromStorageUrl(env, row.url);
    let sourceExists = false;
    try {
      sourceExists = Boolean(
        sourceKey && await processingSourceExists(env, sourceKey),
      );
    } catch (error) {
      const sql = sqlForEnv(env);
      await sql`
        UPDATE media
        SET
          transcode_status='pending',
          transcode_error=${`Unable to verify processing source: ${error instanceof Error ? error.message : String(error)}`},
          updated_at=now()
        WHERE id=${row.id}
          AND transcode_status='processing'
      `;
      return undefined;
    }
    if (!sourceExists) {
      await markProcessingSourceMissing(env, row.id);
      return undefined;
    }
    const sourceUrl = isDriveStorageEnabled(env) && sourceKey
      ? await createDriveSignedDownloadUrl(env, sourceKey)
      : row.url;
    const fileNameBase = getFileParts(row.url).fileNameBase;
    return {
      photoId: row.id,
      sourceUrl,
      sourceKey,
      fileNameBase,
      extension: row.extension,
      processingReason: row.transcode_error || undefined,
      canonicalOutputKey: sourceKey &&
        !PRESERVED_VIDEO_EXTENSIONS.has(row.extension.toLowerCase())
        ? sourceKey.replace(/\.[^/.]+$/, '.mp4')
        : undefined,
    };
  }));
  const readyJobs = jobs
    .filter((job): job is NonNullable<typeof job> => Boolean(job));
  await Promise.all(readyJobs.map(job => logBackendActivity(env, {
    category: 'processing',
    event: 'job_claimed',
    status: 'info',
    message: 'Backend Processor claimed the video job',
    mediaId: job.photoId,
  })));
  return readyJobs;
};

const heartbeatVideoJob = async (
  env: Env,
  body: { photoId?: string, note?: string },
) => {
  const photoId = body.photoId?.trim();
  if (!photoId) {
    return json(400, { error: 'photoId is required' });
  }

  const sql = sqlForEnv(env);
  await sql`
    UPDATE media
    SET
      updated_at=now(),
      transcode_error=${body.note || 'Video processing in progress'}
    WHERE id=${photoId}
      AND transcode_status='processing'
  `;

  return json(200, { success: true });
};

const proxyVideoStreamMultipartUpload = async (
  env: Env,
  body: Record<string, unknown>,
) => {
  if (!isDriveStorageEnabled(env)) {
    return json(503, { error: 'Direct stream upload requires Drive storage' });
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const photoId = typeof body.photoId === 'string' ? body.photoId.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!photoId || !isAllowedProcessorUploadKey(key, photoId)) {
    return json(400, { error: 'Invalid processor upload key' });
  }
  if (!['start', 'part', 'complete', 'abort'].includes(action)) {
    return json(400, { error: 'Invalid multipart action' });
  }
  const response = await fetch(
    `${driveApiBaseUrl(env)}/api/v1/storage/multipart`,
    {
      method: 'POST',
      headers: driveHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...body,
        action,
        key,
        projectId: env.DRIVE_STORAGE_PROJECT_ID,
        bucket: env.DRIVE_STORAGE_BUCKET,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  return json(response.status, data);
};

const uploadProcessorObject = async (env: Env, formData: FormData) => {
  const photoId = formData.get('photoId')?.toString().trim();
  const key = formData.get('key')?.toString().trim() || '';
  const contentType = formData.get('contentType')?.toString().trim() || 'application/octet-stream';
  const file = formData.get('file');
  if (!photoId || !(file instanceof File) || !isAllowedHlsDerivativeKey(key)) {
    return json(400, { error: 'photoId, HLS key, and file are required' });
  }
  const sql = sqlForEnv(env);
  const rows = await sql`SELECT url FROM media WHERE id=${photoId} LIMIT 1` as unknown as Array<{ url: string }>;
  const base = rows[0]?.url ? getFileParts(rows[0].url).fileNameBase : '';
  if (!base || !key.startsWith(`${base}-hls`)) {
    return json(400, { error: 'HLS key does not match the media source' });
  }
  await putObject(env, key, await file.arrayBuffer(), contentType);
  // Drive can acknowledge the write before its object HEAD endpoint sees the
  // new artifact. HLS uploads are published one object at a time, so reuse
  // the same bounded visibility wait as other Drive destinations rather than
  // failing the entire video job on the first stale read.
  const size = await waitForVerifiedStorageCopy({
    sourceSize: file.size,
    readDestinationSize: () => storageObjectSize(env, key),
    attempts: isDriveStorageEnabled(env)
      ? DRIVE_RETRY_TARGET_VISIBILITY_ATTEMPTS
      : 1,
    delayMs: isDriveStorageEnabled(env)
      ? DRIVE_COPY_VISIBILITY_DELAY_MS
      : 0,
  });
  if (size === undefined || size !== file.size) {
    return json(409, { error: 'HLS artifact is not fully readable in storage' });
  }
  return json(200, { success: true, key, size, url: urlForKey(env, key) });
};

const verifyHlsArtifacts = async (
  env: Env,
  fileNameBase: string,
  manifestKey: string,
  rawArtifacts: unknown,
) => {
  if (!isAllowedHlsDerivativeKey(manifestKey) || manifestKey !== `${fileNameBase}-hls.m3u8`) {
    throw new Error('Invalid HLS manifest key');
  }
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length < 2) {
    throw new Error('HLS artifact list is incomplete');
  }
  const artifacts = rawArtifacts.map(item => {
    const value = item as HlsArtifactMetadata;
    const key = value.key?.trim() || '';
    const size = Number(value.size);
    if (!isAllowedHlsDerivativeKey(key) || !key.startsWith(`${fileNameBase}-hls`) ||
        !Number.isFinite(size) || size <= 0) {
      throw new Error(`Invalid HLS artifact metadata: ${key}`);
    }
    return { key, size };
  });
  const byKey = new Map(artifacts.map(artifact => [artifact.key, artifact]));
  const manifest = byKey.get(manifestKey);
  if (!manifest) throw new Error('HLS manifest is missing from artifact list');
  for (const artifact of artifacts) {
    const stored = await storageObjectSize(env, artifact.key);
    if (!isVerifiedStorageCopy(artifact.size, stored)) {
      throw new Error(`HLS artifact is not fully readable in storage: ${artifact.key}`);
    }
  }
  const response = await fetch(urlForKey(env, manifestKey), {
    cache: 'no-store',
    headers: stableStorageReadHeaders(env),
  });
  if (!response.ok) throw new Error('HLS manifest is not readable in storage');
  const manifestText = await response.text();
  if (!/#EXTM3U/.test(manifestText) || !/#EXT-X-STREAM-INF:/i.test(manifestText)) throw new Error('HLS master manifest is incomplete');
  const masterUris = manifestText.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
  const variantArtifacts = masterUris.map(uri => artifacts.find(candidate => urlForKey(env, candidate.key) === uri));
  if (variantArtifacts.some(artifact => !artifact || !/-(?:high|720p)\.m3u8$/i.test(artifact!.key))) throw new Error('HLS master references an unverified rendition');
  for (const variant of variantArtifacts) {
    const response = await fetch(urlForKey(env, variant!.key), {
      cache: 'no-store',
      headers: stableStorageReadHeaders(env),
    });
    if (!response.ok) throw new Error(`HLS rendition is not readable: ${variant!.key}`);
    const text = await response.text();
    if (!/#EXTM3U/.test(text) || !/#EXT-X-PLAYLIST-TYPE:VOD/i.test(text) || !/#EXT-X-MAP:/i.test(text) || !/#EXT-X-ENDLIST/i.test(text)) throw new Error(`HLS rendition is incomplete: ${variant!.key}`);
    const uris = Array.from(text.matchAll(/#EXT-X-MAP:.*?URI="([^"]+)"/gi), match => match[1]).concat(text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')));
    for (const uri of Array.from(new Set(uris))) {
      const artifact = artifacts.find(candidate => urlForKey(env, candidate.key) === uri);
      if (!uri || !artifact || !/-(?:high|720p)-(?:init\.mp4|[0-9]{5}\.m4s)$/i.test(artifact.key)) throw new Error(`HLS rendition references an unverified artifact: ${uri}`);
    }
  }
  return urlForKey(env, manifestKey);
};

// Reconciliation is intentionally idempotent rather than cursor-based: a
// worker crash can leave any artifact missing, and the next claim pass safely
// returns that media to the normal pending FIFO queue.
const reconcileMissingHlsArtifacts = async (env: Env) => {
  await ensureHlsSchema(env);
  const sql = sqlForEnv(env);
  const rows = await sql`
    WITH candidates AS (
      SELECT id
      FROM media
      WHERE media_type='video' AND transcode_status='ready'
        AND (hls_manifest_url IS NULL OR hls_verified_at IS NULL OR
          hls_verified_at < now() - interval '15 minutes')
      ORDER BY hls_verified_at ASC NULLS FIRST, id ASC
      LIMIT 12
      FOR UPDATE SKIP LOCKED
    )
    UPDATE media AS m
    SET hls_verified_at=now()
    FROM candidates
    WHERE m.id=candidates.id
    RETURNING m.id, m.url, m.hls_manifest_url, m.hls_verified_at
  ` as unknown as Array<{ id: string, url: string, hls_manifest_url?: string | null }>;
  for (const row of rows) {
    let missing = !row.hls_manifest_url;
    if (!missing) {
      const manifestKey = keyFromStorageUrl(env, row.hls_manifest_url!);
      const hlsBase = manifestKey.replace(/\.m3u8$/i, '');
      if (!manifestKey || urlForKey(env, manifestKey) !== row.hls_manifest_url ||
          !isAllowedHlsDerivativeKey(manifestKey)) {
        missing = true;
      }
      const manifestResponse = await fetch(row.hls_manifest_url!, {
        cache: 'no-store',
        headers: stableStorageReadHeaders(env),
      }).catch(() => undefined);
      if (!missing && !manifestResponse?.ok) {
        missing = manifestResponse?.status === 404 || !manifestResponse;
      } else if (!missing) {
        const text = await manifestResponse.text();
        const renditionUrls = text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
        if (!/#EXTM3U/.test(text) || !/#EXT-X-STREAM-INF:/i.test(text) || renditionUrls.length < 1) missing = true;
        for (const renditionUrl of renditionUrls) {
          const renditionKey = keyFromStorageUrl(env, renditionUrl);
          if (!renditionKey || urlForKey(env, renditionKey) !== renditionUrl || !/-(?:high|720p)\.m3u8$/i.test(renditionKey) || !renditionKey.startsWith(hlsBase) || await storageObjectSize(env, renditionKey) === undefined) { missing = true; break; }
          const renditionResponse = await fetch(renditionUrl, {
            cache: 'no-store',
            headers: stableStorageReadHeaders(env),
          }).catch(() => undefined);
          if (!renditionResponse?.ok) { missing = true; break; }
          const renditionText = await renditionResponse.text();
          const artifactUrls = Array.from(renditionText.matchAll(/#EXT-X-MAP:.*?URI="([^"]+)"/gi), match => match[1]).concat(renditionText.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')));
          for (const uri of Array.from(new Set(artifactUrls))) {
            const key = keyFromStorageUrl(env, uri);
            if (!key || urlForKey(env, key) !== uri || !isAllowedHlsDerivativeKey(key) || !key.startsWith(hlsBase) || await storageObjectSize(env, key) === undefined) { missing = true; break; }
          }
          if (missing) break;
        }
      }
    }
    if (missing) {
      await sql`
        UPDATE media
        SET transcode_status='pending',
            hls_verified_at=NULL,
            transcode_error='HLS VOD artifact backfill required',
            updated_at=now()
        WHERE id=${row.id} AND transcode_status='ready'
      `;
    } else {
      await sql`
        UPDATE media SET hls_verified_at=now()
        WHERE id=${row.id} AND transcode_status='ready'
      `;
    }
  }
};

const commitCanonicalVideo = async (
  env: Env,
  body: Record<string, unknown>,
) => {
  const photoId = typeof body.photoId === 'string' ? body.photoId.trim() : '';
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const expectedSize = Number(body.size);
  if (!photoId || !key || !Number.isFinite(expectedSize) || expectedSize <= 0) {
    return json(400, { error: 'photoId, key, and size are required' });
  }
  if (!isAllowedProcessorUploadKey(key, photoId)) {
    return json(400, { error: 'Invalid canonical media key' });
  }
  const sql = sqlForEnv(env);
  const mediaRows = await sql`
    SELECT id, url, extension
    FROM media
    WHERE id=${photoId}
    LIMIT 1
  ` as unknown as CanonicalMediaRow[];
  const media = mediaRows[0];
  if (!media || PRESERVED_VIDEO_EXTENSIONS.has(media.extension.toLowerCase())) {
    return json(409, { error: 'Media does not require canonical MP4 conversion' });
  }
  const sourceKey = keyFromStorageUrl(env, media.url);
  const expectedKey = sourceKey.replace(/\.[^/.]+$/, '.mp4');
  if (!sourceKey || key !== expectedKey) {
    return json(400, { error: 'Canonical MP4 key does not match the media source' });
  }
  const storedSize = await storageObjectSize(env, key);
  if (!isVerifiedStorageCopy(expectedSize, storedSize)) {
    return json(409, { error: 'Canonical MP4 is not fully readable in storage' });
  }
  await ensureRegisteredUploadFileMapTable(env);
  const maps = await sql`
    SELECT original_file_name
    FROM registered_upload_file_map
    WHERE media_id=${photoId}
    LIMIT 1
  ` as unknown as Array<{ original_file_name: string }>;
  const originalFileName = maps[0]?.original_file_name ||
    getFileParts(media.url).fileName;
  const canonicalUrl = urlForKey(env, key);
  await sql.transaction(tx => [
    tx`
      UPDATE media
      SET url=${canonicalUrl}, extension='mp4', updated_at=now()
      WHERE id=${photoId} AND url=${media.url}
    `,
    tx`
      INSERT INTO registered_upload_file_map (
        media_id, original_file_name, stored_file_name, stored_url, source_url
      ) VALUES (
        ${photoId}, ${originalFileName}, ${getFileParts(key).fileName},
        ${canonicalUrl}, ${media.url}
      )
      ON CONFLICT (media_id) DO UPDATE SET
        original_file_name=EXCLUDED.original_file_name,
        stored_file_name=EXCLUDED.stored_file_name,
        stored_url=EXCLUDED.stored_url,
        source_url=EXCLUDED.source_url,
        updated_at=now()
    `,
  ]);
  if (sourceKey !== key) {
    await deleteObject(env, sourceKey).catch(error => {
      console.warn('Canonical MP4 committed; source cleanup deferred', {
        photoId,
        sourceKey,
        key,
        error,
      });
    });
  }
  await revalidateMediaPanel(env, photoId).catch(() => undefined);
  return json(200, { success: true, url: canonicalUrl });
};

const completeVideoJob = async (
  env: Env,
  formData: FormData,
) => {
  const photoId = formData.get('photoId')?.toString().trim();
  const fileNameBase = formData.get('fileNameBase')?.toString().trim();
  if (!photoId || !fileNameBase) {
    return json(400, { error: 'photoId and fileNameBase are required' });
  }

  const metadataRaw = formData.get('metadata')?.toString();
  const metadata = metadataRaw
    ? JSON.parse(metadataRaw) as {
      durationSeconds?: number
      frameRate?: number
      mediaWidth?: number
      mediaHeight?: number
    }
    : {};
  const poster = formData.get('poster');
  const preview = formData.get('preview');
  const subtitleFiles = formData.getAll('subtitles')
    .filter((value): value is File => value instanceof File);
  const subtitleMetadataRaw = formData.get('subtitleTracks')?.toString();
  const subtitleMetadata = getValidSubtitleUploadMetadata(
    fileNameBase,
    subtitleMetadataRaw ? JSON.parse(subtitleMetadataRaw) : [],
    subtitleFiles.map(file => file.name),
  );
  let posterUrl: string | undefined;
  let previewUrl: string | undefined;

  if (poster instanceof File) {
    const key = `${fileNameBase}-poster.jpg`;
    await putObject(
      env,
      key,
      await poster.arrayBuffer(),
      poster.type || 'image/jpeg',
    );
    posterUrl = urlForKey(env, key);
  }

  if (preview instanceof File) {
    const extension = getFileParts(preview.name).extension || 'mp4';
    const key = `${fileNameBase}-preview.${extension}`;
    await putObject(
      env,
      key,
      await preview.arrayBuffer(),
      preview.type || 'video/mp4',
    );
    previewUrl = urlForKey(env, key);
  }

  const newSubtitleTracks: SubtitleManifestTrack[] = [];
  for (const track of subtitleMetadata) {
    const file = subtitleFiles.find(candidate => candidate.name === track.fileName);
    if (!file) { continue; }
    await putObject(
      env,
      track.fileName,
      await file.arrayBuffer(),
      file.type || 'text/vtt',
    );
    newSubtitleTracks.push({
      src: urlForKey(env, track.fileName),
      lang: track.lang,
      label: track.label,
    });
  }

  if (newSubtitleTracks.length > 0) {
    const manifestKey = `${fileNameBase}-subtitles.json`;
    const existingManifest = await fetch(urlForKey(env, manifestKey), {
      cache: 'no-store',
      headers: stableStorageReadHeaders(env),
    })
      .then(async response => response.ok
        ? await response.json() as { tracks?: SubtitleManifestTrack[] }
        : undefined)
      .catch(() => undefined);
    const existingTracks = Array.isArray(existingManifest?.tracks)
      ? existingManifest.tracks.filter(track =>
        Boolean(track?.src && track?.lang && track?.label))
      : [];
    const tracks = mergeSubtitleManifestTracks(
      existingTracks,
      newSubtitleTracks,
    );
    await putObject(
      env,
      manifestKey,
      encoder.encode(JSON.stringify({ tracks })).buffer,
      'application/json',
    );
  }

  const sql = sqlForEnv(env);
  await ensureHlsSchema(env);
  await sql`
    UPDATE media
    SET
      poster_url=${posterUrl ?? null},
      preview_url=${previewUrl ?? null},
      hls_manifest_url=NULL,
      hls_verified_at=NULL,
      duration_seconds=${metadata.durationSeconds ?? null},
      frame_rate=${metadata.frameRate ?? null},
      media_width=${metadata.mediaWidth ?? null},
      media_height=${metadata.mediaHeight ?? null},
      aspect_ratio=${(
        metadata.mediaWidth &&
        metadata.mediaHeight
      ) ? metadata.mediaWidth / metadata.mediaHeight : 16 / 9},
      transcode_status='ready',
      transcode_error=NULL,
      updated_at=now()
    WHERE id=${photoId}
  `;

  await logBackendActivity(env, {
    category: 'processing',
    event: 'job_completed',
    status: 'success',
    message: 'Video processing completed',
    mediaId: photoId,
    details: {
      posterGenerated: Boolean(posterUrl),
      previewGenerated: Boolean(previewUrl),
      subtitleTracks: newSubtitleTracks.length,
    },
  });

  await revalidateMediaPanel(env, photoId);

  return json(200, {
    success: true,
    posterUrl,
    previewUrl,
    subtitleTracks: newSubtitleTracks.length,
  });
};

const failVideoJob = async (
  env: Env,
  body: { photoId?: string, transcodeError?: string },
) => {
  const photoId = body.photoId?.trim();
  if (!photoId) {
    return json(400, { error: 'photoId is required' });
  }

  const sql = sqlForEnv(env);
  const errorMessage = body.transcodeError || 'Background processing failed';
  const retryDownload = shouldRetryInterruptedJob(errorMessage);
  await sql`
    UPDATE media
    SET
      transcode_status=${retryDownload ? 'pending' : 'failed'},
      transcode_error=${retryDownload
        ? `Retryable processing interruption; queued for retry: ${errorMessage}`
        : errorMessage},
      updated_at=now()
    WHERE id=${photoId}
  `;

  await logBackendActivity(env, {
    category: 'processing',
    event: retryDownload ? 'job_requeued' : 'job_failed',
    status: retryDownload ? 'warning' : 'error',
    message: retryDownload
      ? 'Interrupted video job was returned to the pending queue'
      : errorMessage,
    mediaId: photoId,
    details: { error: errorMessage },
  });

  await revalidateMediaPanel(env, photoId);

  return json(200, { success: true });
};

export const shouldRetryInterruptedJob = (errorMessage: string) =>
    /source download stalled|fetch failed|processor interrupted|(?:drive|storage) (?:put|upload|finalize) failed \(5\d{2}\)|connection terminated|connection reset|econnreset|timed? out|timeout/i
      .test(errorMessage);

const heartbeatProcessor = async (
  env: Env,
  body: { processorId?: string, platform?: string, state?: string },
) => {
  const processorId = body.processorId?.trim().slice(0, 120);
  if (!processorId) { return json(400, { error: 'processorId is required' }); }
  const sql = sqlForEnv(env);
  await sql`
    CREATE TABLE IF NOT EXISTS video_processor_presence (
      processor_id TEXT PRIMARY KEY,
      platform TEXT,
      state TEXT,
      last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  const presenceRows = await sql`
    WITH previous AS MATERIALIZED (
      SELECT state, last_seen_at
      FROM video_processor_presence
      WHERE processor_id=${processorId}
    )
    INSERT INTO video_processor_presence (
      processor_id, platform, state, last_seen_at
    ) VALUES (
      ${processorId}, ${body.platform || 'unknown'},
      ${body.state || 'idle'}, now()
    )
    ON CONFLICT (processor_id) DO UPDATE SET
      platform=EXCLUDED.platform,
      state=EXCLUDED.state,
      last_seen_at=now()
    RETURNING
      (SELECT state FROM previous) AS previous_state,
      (SELECT last_seen_at FROM previous) AS previous_last_seen_at
  ` as unknown as Array<{
    previous_state?: string | null
    previous_last_seen_at?: string | Date | null
  }>;
  const previous = presenceRows[0];
  const previousLastSeen = previous?.previous_last_seen_at
    ? new Date(previous.previous_last_seen_at).getTime()
    : 0;
  const state = body.state || 'idle';
  const wasOffline = !previousLastSeen ||
    Date.now() - previousLastSeen > 2 * 60 * 1000;
  if (wasOffline || previous?.previous_state !== state) {
    await logBackendActivity(env, {
      category: 'processor',
      event: wasOffline ? 'processor_connected' : 'processor_state_changed',
      status: 'info',
      message: wasOffline
        ? 'Backend Processor connected'
        : `Backend Processor state changed to ${state}`,
      processorId,
      details: { platform: body.platform || 'unknown', state },
    });
  }
  return json(200, { ok: true });
};

const status = async (
  env: Env,
  { jobLimit = 20 }: { jobLimit?: number } = {},
) => {
  const processingJobLimit = Math.min(Math.max(Math.round(jobLimit), 1), 5_000);
  const registrationJobLimit = Math.min(
    Math.max(Math.round(jobLimit * 2.5), 1),
    5_000,
  );
  const runtimeSettings = await getRuntimeProcessingSettings(env);
  const processorPresenceTimeoutSeconds = Math.max(
    1,
    Math.ceil(runtimeSettings.processorHeartbeatIntervalMs * 3 / 1_000),
  );
  const sql = sqlForEnv(env);
  const [
    rows,
    processors,
    activeJobs,
    deletionQueue,
    registrationSnapshotRows,
  ] = await Promise.all([
    sql`
      SELECT transcode_status, COUNT(*)::int AS count
      FROM media
      WHERE transcode_status IN ('pending', 'processing', 'failed')
      GROUP BY transcode_status
    ` as unknown as Promise<Array<{
      transcode_status: string | null
      count: number
    }>>,
    sql`
      SELECT processor_id, platform, state, last_seen_at, started_at
      FROM video_processor_presence
      WHERE last_seen_at > now() - (${String(processorPresenceTimeoutSeconds)} || ' seconds')::interval
      ORDER BY last_seen_at DESC
    `.catch(() => []) as Promise<Record<string, unknown>[]>,
    sql`
      SELECT id, title, transcode_status, transcode_error, updated_at
      FROM media
      WHERE transcode_status IN ('pending', 'processing', 'failed')
      ORDER BY
        CASE WHEN transcode_status='processing' THEN 0 ELSE 1 END,
        updated_at DESC
      LIMIT ${processingJobLimit}
    ` as unknown as Promise<Record<string, unknown>[]>,
    getDeletionQueueCounts(env),
    sql`
      SELECT
        (COUNT(*) FILTER (WHERE status='detected'))::int AS detected,
        (COUNT(*) FILTER (WHERE status='registering'))::int AS registering,
        (COUNT(*) FILTER (WHERE status='error'))::int AS error,
        COUNT(*)::int AS total,
        COALESCE((
          SELECT jsonb_agg(
            to_jsonb(job)
            ORDER BY job.uploaded_at ASC NULLS LAST, job.updated_at ASC, job.url ASC
          )
          FROM (
            -- Active registrations are never truncated: the panel must show every
            -- file currently being copied/verified. Only the inactive preview is
            -- bounded so a large detected backlog cannot inflate every status poll.
            SELECT
              url,
              file_name,
              original_file_name,
              title,
              status,
              media_id,
              extension,
              error_message,
              uploaded_at,
              updated_at
            FROM worker_registration_status
            WHERE status = 'registering'
            UNION ALL
            SELECT *
            FROM (
              SELECT
                url,
                file_name,
                original_file_name,
                title,
                status,
                media_id,
                extension,
                error_message,
                uploaded_at,
                updated_at
              FROM worker_registration_status
              WHERE status IN ('detected', 'error')
              ORDER BY uploaded_at ASC NULLS LAST, updated_at ASC, url ASC
              LIMIT ${registrationJobLimit}
            ) inactive
          ) job
        ), '[]'::jsonb) AS jobs
      FROM worker_registration_status
      WHERE status IN ('detected', 'registering', 'error')
    ` as unknown as Promise<Array<{
      detected: number
      registering: number
      error: number
      total: number
      jobs: Record<string, unknown>[]
    }>>,
  ]);
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.transcode_status || 'unknown'] = row.count;
    return acc;
  }, {});
  const registrationSnapshot = registrationSnapshotRows[0] || {
    detected: 0,
    registering: 0,
    error: 0,
    total: 0,
    jobs: [],
  };
  const registrationOwner = !runtimeSettings.processorRegistrationEnabled
    ? 'worker'
    : runtimeSettings.processorOnlyRegistration
    ? (processors.length > 0 ? 'processor' : 'processor-waiting')
    : (processors.length > 0 ? 'processor' : 'worker');
  return {
    ...counts,
    processors,
    activeJobs,
    deletionQueue,
    registrationQueue: {
      detected: registrationSnapshot.detected,
      registering: registrationSnapshot.registering,
      error: registrationSnapshot.error,
      total: registrationSnapshot.total,
    },
    registrationJobs: registrationSnapshot.jobs,
    registrationOwner,
    processorRegistrationEnabled: runtimeSettings.processorRegistrationEnabled,
    processorOnlyRegistration: runtimeSettings.processorOnlyRegistration,
    build: WORKER_BUILD_ID,
    storageProvider: detectStorageProvider(env),
    checkedAt: new Date().toISOString(),
  };
};

let scanInFlight: Promise<Awaited<ReturnType<typeof scanAndRegister>>> | undefined;
let deletionDrainInFlight: Promise<number> | undefined;

const startDeletionDrain = (env: Env) => {
  if (deletionDrainInFlight) {
    return { started: false, promise: deletionDrainInFlight };
  }
  const promise = drainMediaDeletionQueue(env).finally(() => {
    if (deletionDrainInFlight === promise) {
      deletionDrainInFlight = undefined;
    }
  });
  deletionDrainInFlight = promise;
  return { started: true, promise };
};

const startScan = (
  env: Env,
  {
    shareInFlight = true,
    waitUntil,
  }: {
    shareInFlight?: boolean
    waitUntil?: (promise: Promise<unknown>) => void
  } = {},
) => {
  // Scheduled events are independent invocations. The database lease is the
  // cross-invocation concurrency guard; sharing a promise here could let one
  // hung isolate suppress every later cron run indefinitely.
  if (shareInFlight && scanInFlight) {
    return { started: false, promise: scanInFlight };
  }
  const observe = (operation: Promise<unknown>) => {
    if (waitUntil) {
      waitUntil(operation);
    } else {
      void operation;
    }
  };
  const promise = (async () => {
    try {
      // Activity logging is observability only. A transient database failure
      // here must never prevent the actual FIFO scan from starting.
      observe(logBackendActivity(env, {
        category: 'orchestrator',
        event: 'scan_started',
        status: 'info',
        message: 'Storage scan started',
        details: { storageProvider: detectStorageProvider(env) },
      }).catch(error => {
        console.warn('Unable to log registration scan start', error);
      }));
      // Every database, storage, and Drive operation in the scan has its own
      // bounded timeout. Do not race the whole queue against a wall-clock
      // watchdog: that creates a false timeout while the underlying scan keeps
      // running and still owns the lease, making later cron runs look stalled.
      const result = await scanAndRegister(env, { waitUntil });
      observe(logBackendActivity(env, {
        category: 'orchestrator',
        event: 'scan_completed',
        status: 'success',
        message: 'Storage scan completed',
        details: result,
      }).catch(error => {
        console.warn('Unable to log registration scan completion', error);
      }));
      return result;
    } catch (error) {
      observe(logBackendActivity(env, {
        category: 'orchestrator',
        event: 'scan_failed',
        status: 'error',
        message: error instanceof Error ? error.message : 'Storage scan failed',
      }).catch(logError => {
        console.warn('Unable to log registration scan failure', logError);
      }));
      throw error;
    }
  })().finally(() => {
    if (shareInFlight && scanInFlight === promise) {
      scanInFlight = undefined;
    }
  });
  if (shareInFlight) {
    scanInFlight = promise;
  }
  return { started: true, promise };
};

const keepScheduledScanBounded = (
  scanPromise: Promise<Awaited<ReturnType<typeof scanAndRegister>>>,
  env: Env,
  ctx: ExecutionContext,
) => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<{ timedOut: true }>(resolve => {
    timeoutHandle = setTimeout(() => resolve({ timedOut: true }), SCHEDULED_SCAN_DEADLINE_MS);
  });
  const bounded = Promise.race([
    scanPromise.then(result => ({ timedOut: false as const, result })),
    watchdog,
  ]).then(outcome => {
    if (!outcome.timedOut) { return; }
    const breakerLog = logBackendActivity(env, {
      category: 'orchestrator',
      event: 'scheduled_scan_circuit_breaker',
      status: 'warning',
      message: 'Scheduled registration invocation exceeded its safety window; durable queue will retry',
      details: { deadlineMs: SCHEDULED_SCAN_DEADLINE_MS },
    }).catch(error => {
      console.warn('Unable to log scheduled scan circuit breaker', error);
    });
    // Observability must not hold the circuit breaker open. Keep the log
    // attempt alive only briefly, then let the scheduled invocation finish.
    ctx.waitUntil(Promise.race([breakerLog, sleep(1_000)]));
  }).catch(error => {
    console.warn('Scheduled registration scan failed', error);
  }).finally(() => {
    if (timeoutHandle) { clearTimeout(timeoutHandle); }
  });
  ctx.waitUntil(bounded);
};

const scheduleScan = (env: Env, ctx: ExecutionContext) => {
  const scan = startScan(env, { waitUntil: promise => ctx.waitUntil(promise) });
  if (scan.started) {
    ctx.waitUntil(scan.promise);
  }
  return scan.started;
};

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    const discoveryOnly = (REGISTRATION_DISCOVERY_CRONS as readonly string[])
      .includes(controller.cron);
    const scheduledEnv: Env = {
      ...env,
      REGISTRATION_SCHEDULED: '1',
      REGISTRATION_DISCOVERY_ONLY: discoveryOnly ? '1' : '0',
    };
    // Discovery has its own bounded cron. It may list storage and refresh the
    // cursor/configuration, but it never claims or registers a row, so a slow
    // inventory pass cannot consume the registration invocation's CPU budget.
    if (discoveryOnly) {
      ctx.waitUntil((async () => {
        try {
          const settings = runtimeSettingsCache?.settings ??
            getDefaultRuntimeProcessingSettings(scheduledEnv);
          if (!settings.orchestratorEnabled || !settings.registrationEnabled) {
            await logBackendActivity(scheduledEnv, {
              category: 'orchestrator',
              event: 'scheduled_scan_skipped',
              status: 'warning',
              message: 'Discovery skipped because registration is disabled',
            });
            return;
          }
          const discovery = await runRegistrationDiscoveryPage(
            scheduledEnv,
            REGISTRATION_DISCOVERY_PAGE_SIZE,
          );
          if (discovery.discovered > 0) {
            console.log(JSON.stringify({
              category: 'registration',
              event: 'storage_objects_detected',
              status: 'success',
              count: discovery.discovered,
              pageSize: discovery.pageSize,
            }));
          }
        } catch (error) {
          console.warn('Scheduled registration discovery failed', error);
        }
      })());
      return;
    }

    // The hot path must be claim -> ID -> Drive -> atomic commit. Use the
    // last DB-backed settings cache and never open a settings connection here.
    const settings = runtimeSettingsCache?.settings ??
      getDefaultRuntimeProcessingSettings(scheduledEnv);
    if (!settings.orchestratorEnabled || !settings.registrationEnabled) {
      ctx.waitUntil(logBackendActivity(scheduledEnv, {
        category: 'orchestrator',
        event: 'scheduled_scan_skipped',
        status: 'warning',
        message: 'Scheduled registration skipped because it is disabled',
      }).catch(error => {
        console.warn('Unable to log scheduled scan skip', error);
      }));
      return;
    }
    const scan = startScan(
      envWithRuntimeSettings(scheduledEnv, settings),
      {
        shareInFlight: false,
        waitUntil: promise => ctx.waitUntil(promise),
      },
    );
    if (scan.started) {
      keepScheduledScanBounded(scan.promise, scheduledEnv, ctx);
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      return landingResponse(request, await getWorkerLandingMetadata(env));
    }

    if (url.pathname === '/health') {
      return json(200, { ok: true, build: WORKER_BUILD_ID });
    }

    if (url.pathname === '/status') {
      if (!isAuthorized(request, env.BACKEND_ORCHESTRATOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      try {
        const rawQueueLimit = Number(url.searchParams.get('queueLimit'));
        const queueLimit = Number.isFinite(rawQueueLimit)
          ? Math.min(Math.max(Math.round(rawQueueLimit), 1), 5_000)
          : undefined;
        const [settings, snapshot] = await Promise.all([
          getRuntimeProcessingSettings(env),
          status(env, queueLimit ? { jobLimit: queueLimit } : undefined),
        ]);
        return json(200, { ...snapshot, settings });
      } catch (error: any) {
        return json(500, { error: error?.message || 'Status failed' });
      }
    }

    if (url.pathname === '/logs' && request.method === 'GET') {
      if (!isAuthorized(request, env.BACKEND_ORCHESTRATOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      const rawLimit = parseInt(url.searchParams.get('limit') || '200', 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 500)
        : 200;
      try {
        return json(200, {
          logs: await getBackendActivityLogs(env, limit),
          checkedAt: new Date().toISOString(),
        });
      } catch (error: any) {
        return json(500, { error: error?.message || 'Activity logs failed' });
      }
    }

    if (url.pathname === '/deletions/run' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_ORCHESTRATOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      const drain = startDeletionDrain(env);
      ctx.waitUntil(drain.promise.catch((error) => {
        console.warn('Deletion queue drain failed', error);
      }));
      return json(drain.started ? 202 : 200, {
        triggered: true,
        started: drain.started,
      });
    }

    // Processor registration pulls must reach the atomic queue claim without
    // first opening the general runtime-settings connection. The processor
    // refreshes /jobs/config separately; a warm cache enforces the latest DB
    // toggle, while a cold isolate safely defaults this optional feature off.
    if (url.pathname === '/registration/jobs/run' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      const settings = runtimeSettingsCache?.settings ??
        getDefaultRuntimeProcessingSettings(env);
      if (!settings.orchestratorEnabled || !settings.registrationEnabled ||
        !settings.processorRegistrationEnabled) {
        return json(200, { claimed: 0, registered: 0, disabled: true });
      }
      try {
        const processorEnv = {
          ...envWithRuntimeSettings(env, settings),
          REGISTRATION_SCHEDULED: '1',
          REGISTRATION_PROCESSOR_ONLY: '1',
          REGISTRATION_PROCESSOR_PULL: '1',
        };
        const scan = startScan(processorEnv, {
          shareInFlight: false,
          waitUntil: promise => ctx.waitUntil(promise),
        });
        const result = await scan.promise;
        return json(200, {
          claimed: result.registered > 0 ? 1 : 0,
          ...result,
        });
      } catch (error: any) {
        return json(500, {
          error: error?.message || 'Processor registration run failed',
        });
      }
    }

    const settings = await getRuntimeProcessingSettings(env);
    const runtimeEnv = envWithRuntimeSettings(env, settings);

    if (url.pathname === '/registration/retry' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_ORCHESTRATOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      const body = await request.json().catch(() => ({})) as {
        url?: unknown
        sourceUrl?: unknown
      };
      const urls = [body.url, body.sourceUrl]
        .filter((value): value is string => typeof value === 'string');
      if (urls.length === 0) {
        return json(400, { error: 'A registration URL is required' });
      }
      try {
        const requeued = await requeueRegistrationStatuses(runtimeEnv, urls);
        const scanQueued = settings.orchestratorEnabled && settings.registrationEnabled
          ? scheduleScan(runtimeEnv, ctx)
          : false;
        return json(scanQueued ? 202 : 200, {
          requeued,
          triggered: scanQueued,
          statusMessage: requeued > 0
            ? 'Registration requeued for worker retry'
            : 'Worker scan requested',
        });
      } catch (error: any) {
        return json(500, { error: error?.message || 'Unable to retry registration' });
      }
    }

    if (url.pathname === '/recovery' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_ORCHESTRATOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      if (!settings.orchestratorEnabled || !settings.registrationEnabled) {
        return json(200, {
          triggered: false,
          disabled: true,
          statusMessage: 'Registration is disabled in processing settings',
        });
      }
      try {
        // Recovery is deliberately separate from the normal scan caller. It
        // requeues only genuinely stale/incomplete claims; active Drive copies
        // remain protected from duplicate work. The scheduled path runs this
        // same stale-row maintenance automatically on every cron tick.
        const requeued = await clearStaleRegistrationStatuses(runtimeEnv);
        const scanQueued = scheduleScan(runtimeEnv, ctx);
        ctx.waitUntil(logBackendActivity(runtimeEnv, {
          category: 'orchestrator',
          event: 'registration_recovery_requested',
          status: 'info',
          message: scanQueued
            ? 'Registration recovery scan requested'
            : 'Registration recovery scan joined an existing run',
          details: { requeued, scanQueued },
        }).catch(error => {
          console.warn('Unable to log registration recovery request', error);
        }));
        return json(scanQueued ? 202 : 200, {
          triggered: true,
          scanStarted: scanQueued,
          requeued,
          statusMessage: requeued > 0
            ? `Requeued ${requeued} stale registration${requeued === 1 ? '' : 's'}; worker scan requested`
            : scanQueued
              ? 'No stale claims found; worker scan requested'
              : 'A worker scan is already running',
        });
      } catch (error: any) {
        return json(500, { error: error?.message || 'Registration recovery failed' });
      }
    }

    if (url.pathname === '/run' || url.pathname === '/scan') {
      if (!isAuthorized(request, env.BACKEND_ORCHESTRATOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      if (!settings.orchestratorEnabled || !settings.registrationEnabled) {
        return json(200, { triggered: false, disabled: true });
      }
      try {
        const trackedRegistrations = await getTrackedRegistrationStatuses(runtimeEnv);
        const activeRegistrations = trackedRegistrations
          .filter(({ status }) => status === 'registering');
        if (url.pathname === '/scan') {
          const scan = startScan(runtimeEnv, {
            waitUntil: promise => ctx.waitUntil(promise),
          });
          const result = await scan.promise;
          return json(200, {
            triggered: true,
            scanStarted: scan.started,
            registeringUrls: activeRegistrations.map(({ url }) => url),
            ...result,
          });
        }
        const scanQueued = scheduleScan(runtimeEnv, ctx);
        return json(scanQueued ? 202 : 200, {
          triggered: true,
          registeringUrls: activeRegistrations.map(({ url }) => url),
        });
      } catch (error: any) {
        return json(500, { error: error?.message || 'Scan failed' });
      }
    }

    if (url.pathname === '/jobs/claim') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      if (!settings.orchestratorEnabled || !settings.videoProcessingEnabled) {
        return json(200, { claimed: 0, jobs: [], disabled: true });
      }
      const rawLimit = parseInt(url.searchParams.get('limit') || '1', 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 3)
        : 1;
      try {
        const jobs = await claimVideoJobs(runtimeEnv, limit);
        return json(200, {
          claimed: jobs.length,
          pendingVideos: await countPendingVideos(env),
          jobs,
        });
      } catch (error: any) {
        return json(500, { error: error?.message || 'Claim failed' });
      }
    }

    if (url.pathname === '/jobs/config' && request.method === 'GET') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      return json(200, {
        pollIntervalMs: settings.processorPollIntervalMs,
        idleIntervalMs: settings.processorIdleIntervalMs,
        heartbeatIntervalMs: settings.processorHeartbeatIntervalMs,
        claimLimit: settings.processorClaimLimit,
        processorRegistrationEnabled: settings.processorRegistrationEnabled,
        processorOnlyRegistration: settings.processorOnlyRegistration,
        enabled: settings.orchestratorEnabled && settings.videoProcessingEnabled,
      });
    }

    if (url.pathname === '/processors/heartbeat' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      return heartbeatProcessor(
        runtimeEnv,
        await request.json().catch(() => ({})) as Record<string, string>,
      );
    }

    if (url.pathname === '/jobs/complete' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      try {
        const formData = await request.formData();
        return await completeVideoJob(env, formData);
      } catch (error: any) {
        return json(500, { error: error?.message || 'Complete failed' });
      }
    }

    if (
      url.pathname === '/jobs/storage/multipart' &&
      request.method === 'POST'
    ) {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      try {
        const body = await request.json().catch(() => ({})) as
          Record<string, unknown>;
        return await proxyVideoStreamMultipartUpload(env, body);
      } catch (error: any) {
        return json(500, { error: error?.message || 'Stream upload failed' });
      }
    }

    if (
      url.pathname === '/jobs/storage/status' &&
      request.method === 'GET'
    ) {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      const key = url.searchParams.get('key')?.trim() || '';
      if (!isAllowedStreamDerivativeKey(key) && !isAllowedHlsDerivativeKey(key)) {
        return json(400, { error: 'Invalid stream derivative key' });
      }
      const size = await storageObjectSize(env, key);
      return json(200, {
        exists: size !== undefined,
        size,
        url: size !== undefined ? urlForKey(env, key) : undefined,
      });
    }
    if (url.pathname === '/jobs/storage/upload' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      try {
        return await uploadProcessorObject(env, await request.formData());
      } catch (error: any) {
        return json(500, { error: error?.message || 'HLS upload failed' });
      }
    }
    if (url.pathname === '/jobs/canonical/commit' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      return commitCanonicalVideo(
        env,
        await request.json().catch(() => ({})) as Record<string, unknown>,
      );
    }

    if (url.pathname === '/jobs/fail' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      try {
        const body = await request.json().catch(() => ({})) as {
          photoId?: string
          transcodeError?: string
        };
        return await failVideoJob(env, body);
      } catch (error: any) {
        return json(500, { error: error?.message || 'Fail failed' });
      }
    }

    if (url.pathname === '/jobs/heartbeat' && request.method === 'POST') {
      if (!isAuthorized(request, env.BACKEND_PROCESSOR_SHARED_SECRET)) {
        return json(401, { error: 'Unauthorized' });
      }
      try {
        const body = await request.json().catch(() => ({})) as {
          photoId?: string
          note?: string
        };
        return await heartbeatVideoJob(env, body);
      } catch (error: any) {
        return json(500, { error: error?.message || 'Heartbeat failed' });
      }
    }

    return json(404, { error: 'Not found' });
  },
};
