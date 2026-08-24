import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DRIVE_COPY_VISIBILITY_ATTEMPTS,
  DRIVE_COPY_VISIBILITY_DELAY_MS,
  DRIVE_RETRY_TARGET_VISIBILITY_ATTEMPTS,
  SCAN_LEASE_SECONDS,
  buildDeletionPrefixes,
  deletionKeyMatchesPrefix,
  deleteStorageKeyIfPresent,
  detectStorageProvider,
  findAvailableMediaId,
  getValidSubtitleUploadMetadata,
  isDeferredSourceCleanupSafe,
  isExactVerifiedStorageCopy,
  isAllowedStreamDerivativeKey,
  isAllowedHlsDerivativeKey,
  isAllowedProcessorUploadKey,
  isProtectedRegistrationDestination,
  isRecoverableDriveCopyError,
  isRetryableRegistrationStatusError,
  isVerifiedStorageCopy,
  mergeSubtitleManifestTracks,
  runSafeRegistrationCommit,
  selectOldestRegistrationBatch,
  shouldMarkProcessingSourceMissing,
  shouldRetryInterruptedJob,
  shouldVerifyExistingRegistrationDestination,
  shouldWaitForTrackedRegistrationDestination,
  stableMediaIdForUrl,
  waitForVerifiedStorageCopy,
} from '../src/index.ts';

const workerSource = await readFile(
  new URL('../src/index.ts', import.meta.url),
  'utf8',
);

test('storage provider is detected without a preference variable', () => {
  assert.equal(detectStorageProvider({
    DRIVE_STORAGE_BASE_URL: 'https://drive.example/storage',
    DRIVE_STORAGE_API_KEY: 'drive-key',
    DRIVE_STORAGE_PROJECT_ID: 'project',
    DRIVE_STORAGE_BUCKET: 'media',
  }), 'drive');
  assert.equal(detectStorageProvider({
    R2_PUBLIC_BASE_URL: 'https://media.example',
    R2_ACCOUNT_ID: 'account',
    R2_BUCKET: 'media',
    R2_ACCESS_KEY_ID: 'r2-key',
    R2_SECRET_ACCESS_KEY: 'r2-secret',
  }), 'cloudflare-r2');
  assert.equal(detectStorageProvider({
    DRIVE_STORAGE_BASE_URL: 'https://drive.example/storage',
    R2_PUBLIC_BASE_URL: 'https://media.example',
  }), 'cloudflare-r2');
});

test('large registration backlogs are selected one FIFO batch at a time', () => {
  const pending = Array.from({ length: 100 }, (_, index) => ({
    key: `uploads/file-${String(index).padStart(3, '0')}.mp4`,
    uploaded: new Date(Date.UTC(2026, 7, 21, 0, index)),
  })).reverse();

  assert.deepEqual(
    selectOldestRegistrationBatch(pending, new Set(), 3).map(row => row.key),
    [
      'uploads/file-000.mp4',
      'uploads/file-001.mp4',
      'uploads/file-002.mp4',
    ],
  );
  assert.deepEqual(
    selectOldestRegistrationBatch(
      pending,
      new Set(['uploads/file-000.mp4']),
      1,
    ).map(row => row.key),
    ['uploads/file-001.mp4'],
  );
  assert.deepEqual(
    selectOldestRegistrationBatch(
      pending,
      new Set(),
      2,
      new Set(['uploads/file-000.mp4']),
    ).map(row => row.key),
    ['uploads/file-001.mp4', 'uploads/file-002.mp4'],
  );
});

test('Drive copy failures distinguish retryable transport errors from bad credentials', () => {
  assert.equal(isRecoverableDriveCopyError(new Error('Drive copy failed (401): Invalid API key')), false);
  assert.equal(isRecoverableDriveCopyError(new Error('Drive copy failed (404): Source not found')), false);
  assert.equal(isRecoverableDriveCopyError(new Error('Drive copy failed (429): Too many requests')), true);
  assert.equal(isRecoverableDriveCopyError(new Error('fetch failed')), true);
  assert.equal(isRecoverableDriveCopyError(new Error('Drive source metadata unavailable (503)')), true);
});

test('manual scans do not revive terminal registration errors', () => {
  assert.equal(isRetryableRegistrationStatusError(null), true);
  assert.equal(isRetryableRegistrationStatusError('Drive copy failed (503)'), true);
  assert.equal(isRetryableRegistrationStatusError('Copied destination size mismatch: source=100 destination=50'), true);
  assert.equal(isRetryableRegistrationStatusError('Drive copy failed (403): permission denied'), false);
  assert.equal(isRetryableRegistrationStatusError('Upload not found in storage; finalize or re-upload the file'), false);
});

test('manual registration attempts cannot race an already claimed row', () => {
  const start = workerSource.indexOf('const incrementRegistrationAttempt');
  const end = workerSource.indexOf('type RegistrationStatusWrite', start);
  const source = workerSource.slice(start, end);
  assert.match(source, /status IN \('detected', 'error'\)/);
  assert.match(source, /COALESCE\(attempt_count, 0\) < \$\{maxAttempts\}/);
  assert.match(source, /rows\[0\] \? Number\(rows\[0\]\.attempt_count\) : undefined/);
});

test('generated destination recovery carries the attempt count into its declared column', () => {
  const start = workerSource.indexOf('const replaceRegistrationStatusUrl');
  const end = workerSource.indexOf('const syncDetectedStatuses', start);
  const source = workerSource.slice(start, end);
  assert.match(source, /error_message,\s*attempt_count/);
  assert.match(source, /extension,\s*NULL,\s*COALESCE\(attempt_count, 0\)/);
});

test('generic registration status upsert keeps target and select columns aligned', () => {
  const start = workerSource.indexOf('const upsertRegistrationStatusBatch');
  const end = workerSource.indexOf('const upsertRegistrationStatuses', start);
  const source = workerSource.slice(start, end);
  assert.match(source, /error_message\s*\)\s*SELECT[\s\S]*?error_message\s+FROM incoming/);
  assert.doesNotMatch(source, /error_message,\s*attempt_count\s*\)\s*SELECT/);
});

test('scheduled registration skips schema DDL on the hot path', () => {
  const start = workerSource.indexOf('const ensureRegistrationStatusTable');
  const end = workerSource.indexOf('const clearStaleRegistrationStatuses', start);
  const source = workerSource.slice(start, end);
  assert.match(source, /if \(env\.REGISTRATION_SCHEDULED === '1'\) return/);
});

test('terminal registration errors re-enter a bounded retry cycle automatically', () => {
  const start = workerSource.indexOf('const claimRegistrationQueueRow');
  const end = workerSource.indexOf('const getRegistrationStatusRowsByUrls', start);
  const source = workerSource.slice(start, end);
  assert.match(source, /status='error'[\s\S]*?COALESCE\(attempt_count, 0\) >= \$\{maxAttempts\}[\s\S]*?COALESCE\(updated_at, created_at, TIMESTAMP 'epoch'\)/);
  assert.match(source, /candidate\.was_terminal_retry/);
  assert.match(source, /attempt_count=CASE[\s\S]*?THEN 1/);
  assert.match(source, /error_message LIKE 'Drive copy failed \(5%'/);
  assert.doesNotMatch(source, /error_message LIKE 'Drive copy failed \(403%'/);
  const terminalStart = source.indexOf("error_message LIKE 'Registration stopped after % attempts; retry it manually'");
  const terminal = source.slice(terminalStart, source.indexOf("\n          )", terminalStart));
  assert.doesNotMatch(terminal, /Registration stopped after %: Drive copy failed/);
  assert.match(source, /Registration source not found in storage/);
  const discoveryStart = workerSource.indexOf('const discoverRegistrationPage');
  const discoveryEnd = workerSource.indexOf('const runRegistrationDiscoveryPage', discoveryStart);
  const discovery = workerSource.slice(discoveryStart, discoveryEnd);
  assert.match(discovery, /status='error'/);
  assert.match(discovery, /attempt_count=0/);
  assert.match(discovery, /status='detected'/);
  assert.match(discovery, /s\.url=i\.url OR s\.source_url=i\.url/);
  assert.match(discovery, /s\.error_message LIKE 'Drive copy failed \(5%'/);
  assert.doesNotMatch(discovery, /s\.error_message LIKE 'Drive copy failed \(403%'/);
  assert.doesNotMatch(discovery, /s\.error_message LIKE 'Registration stopped after %: Drive copy failed/);
});

test('registration scans process a bounded slice instead of one file per cron', () => {
  assert.match(workerSource, /registerBatchSize: getNumber\(env\.REGISTER_BATCH_SIZE, 2/);
  assert.match(workerSource, /maxRegisterPasses: getNumber\(env\.MAX_REGISTER_PASSES, 2/);
  assert.match(workerSource, /getNumber\(env\.REGISTER_BATCH_SIZE, 2, \{[\s\S]*?min: 1/);
  assert.match(workerSource, /getNumber\(env\.MAX_REGISTER_PASSES, 2, \{[\s\S]*?min: 1/);
  assert.match(workerSource, /deferredRegistrationKeys/);
  assert.match(workerSource, /error_message,\s*updated_at/);
});

test('worker landing links use clear configured labels', () => {
  assert.match(workerSource, /<a href=\"\$\{escapeLandingHtml\(metadata\.githubUrl\)\}[^>]*>GitHub/);
  assert.match(workerSource, /<a href=\"\$\{escapeLandingHtml\(metadata\.panelUrl\)\}[^>]*>Media Panel/);
  assert.match(workerSource, /<a href=\"\$\{escapeLandingHtml\(metadata\.portfolioUrl\)\}[^>]*>Portfolio/);
});

test('optional upload hint database work cannot stop the registration queue', () => {
  const hintStart = workerSource.indexOf('const getUploadRegistrationHints');
  const hintEnd = workerSource.indexOf('const replaceUploadRegistrationHintUrl', hintStart);
  const hintSource = workerSource.slice(hintStart, hintEnd);
  assert.match(hintSource, /REGISTRATION_HINT_LOOKUPS_ENABLED !== '1'/);
  assert.match(hintSource, /continuing without hints/);
  assert.match(workerSource, /const getPendingUploadRegistrationHints[\s\S]*?return \[\];/);
});

test('video processing claims the oldest pending upload first', () => {
  const claimStart = workerSource.indexOf('const claimVideoJobs');
  const claimEnd = workerSource.indexOf('const getProcessorJobs', claimStart);
  const source = workerSource.slice(claimStart, claimEnd);

  assert.match(source, /ORDER BY created_at ASC, id ASC/);
  assert.doesNotMatch(source, /created_at DESC/);
});

test('detected and registering status transitions use batch database writes', () => {
  const syncStart = workerSource.indexOf('const syncDetectedStatuses');
  const syncEnd = workerSource.indexOf('const retryStaleProcessing', syncStart);
  const syncSource = workerSource.slice(syncStart, syncEnd);
  assert.match(syncSource, /upsertRegistrationStatuses/);
  assert.match(syncSource, /filter\(\(\[url\]\) => !registrationRowsByUrl\.has\(url\)\)/);
  assert.doesNotMatch(syncSource, /Promise\.all/);

  assert.match(workerSource, /jsonb_to_recordset/);
  assert.match(workerSource, /REGISTRATION_STATUS_WRITE_BATCH_SIZE = 25/);
  assert.match(workerSource, /rows\.slice\(offset, offset \+ REGISTRATION_STATUS_WRITE_BATCH_SIZE\)/);
  assert.doesNotMatch(
    workerSource,
    /Promise\.all\(batch\.map\(object => \{[\s\S]*?status: 'registering'/,
  );
});

test('only an in-progress registration is recovered as stalled', () => {
  const staleStart = workerSource.indexOf('const clearStaleRegistrationStatuses');
  const staleEnd = workerSource.indexOf('const clearOldCompletedRegistrationStatuses', staleStart);
  const staleSource = workerSource.slice(staleStart, staleEnd);

  assert.match(staleSource, /WHERE status='registering'/);
  // A freshly claimed row has no media_id until the commit. Recovery must
  // wait for the durable age threshold instead of requeueing it immediately.
  assert.doesNotMatch(staleSource, /media_id IS NULL\s*OR/);
  assert.match(staleSource, /COALESCE\(updated_at, created_at, TIMESTAMP 'epoch'\) <[\s\S]*?now\(\)/);
  assert.doesNotMatch(staleSource, /status IN \('detected', 'registering'\)/);
  assert.match(staleSource, /WHERE status='detected'[\s\S]*?error_message=\$\{STALE_REGISTRATION_ERROR_MESSAGE\}/);
});

test('a registration scan does not fan out direct database connections for a backlog', () => {
  const scanStart = workerSource.indexOf('const scanAndRegisterWithLease');
  const scanEnd = workerSource.indexOf('const scanAndRegister =', scanStart);
  const source = workerSource.slice(scanStart, scanEnd);

  assert.match(source, /listStoragePage\([\s\S]*inventoryCursor/);
  assert.match(source, /setRegistrationScanCursor\(/);
  assert.match(source, /getMediaRows\(env\)/);
  assert.match(source, /getQueuedDeletionPrefixes\(env\)/);
  assert.doesNotMatch(source, /listAllObjects\(env\)/);
});

test('an unverified Drive copy cannot reach registration commit or source cleanup', () => {
  assert.doesNotMatch(workerSource, /if \(copyResult\.verified \|\| copyResult\.pending\)/);
  assert.match(workerSource, /if \(copyResult\.pending\)[\s\S]{0,500}throw new Error\('Drive copy not ready/);
});

test('storage inventory uses a bounded resumable page', () => {
  assert.match(workerSource, /REGISTRATION_SCAN_PAGE_SIZE = 100/);
  assert.match(workerSource, /const registerBatchSize = configuredRegisterBatchSize/);
  assert.match(workerSource, /const maxRegisterPasses = configuredMaxRegisterPasses/);
  assert.match(workerSource, /paged.*1/);
  assert.match(workerSource, /nextContinuationToken/);
  assert.match(workerSource, /worker_registration_scan_cursor/);
});

test('scheduled registration claims enforce the configured global concurrency cap', () => {
  const claimStart = workerSource.indexOf('const claimRegistrationQueueRow');
  const claimEnd = workerSource.indexOf('const getRegistrationStatusRowsByUrls', claimStart);
  const claimSource = workerSource.slice(claimStart, claimEnd);
  assert.match(claimSource, /pg_advisory_xact_lock/);
  assert.match(claimSource, /active_count < \$\{concurrencyLimit\}/);
  assert.match(claimSource, /was_stale_retry/);
  assert.match(workerSource, /claimedRegistrationRow\?\.was_stale_retry/);
  assert.match(workerSource, /claimRegistrationQueueRow\(env, registerBatchSize\)/);
});

test('registration status and logs expose file-level queue progress', () => {
  assert.match(workerSource, /registrationQueue:/);
  assert.match(workerSource, /registrationJobs:/);
  assert.match(workerSource, /event: 'registration_started'/);
  assert.match(workerSource, /event: isRecoverableCopyDelay[\s\S]*?'registration_waiting_for_storage'/);
  assert.match(workerSource, /registrationMaxAttempts/);
  assert.match(workerSource, /phase: registrationPhase/);
});

test('scheduled logging keeps the Free-plan CPU hot path bounded', () => {
  assert.match(workerSource, /if \(env\.REGISTRATION_SCHEDULED === '1'\)[\s\S]*?const status = activity\.status \|\| 'info'/);
  assert.match(workerSource, /if \(status === 'info' && !keepPhaseMarker\) \{\s*return;/);
});

test('direct-upload discovery is isolated from the registration hot path', () => {
  assert.match(workerSource, /const discoverRegistrationPage = async/);
  assert.match(workerSource, /registered_upload_file_map/);
  assert.match(workerSource, /runRegistrationDiscoveryPage/);
  assert.match(workerSource, /Scheduled registration discovery page failed/);
  assert.match(workerSource, /REGISTRATION_DISCOVERY_CRON = REGISTRATION_DISCOVERY_CRONS\[0\]/);
  assert.match(workerSource, /REGISTRATION_DISCOVERY_CRONS = \[/);
  assert.doesNotMatch(workerSource, /'1-59\/2 \* \* \* \*'/);
  assert.match(workerSource, /REGISTRATION_DISCOVERY_CRONS[\s\S]*includes\(controller\.cron\)/);
  assert.match(workerSource, /REGISTRATION_DISCOVERY_PAGE_SIZE = 100/);
  assert.match(workerSource, /REGISTRATION_DISCOVERY_SQL_BATCH_SIZE = 100/);
  assert.match(workerSource, /offset \+= REGISTRATION_DISCOVERY_SQL_BATCH_SIZE/);
  assert.match(workerSource, /Math\.min\(pageSize, REGISTRATION_DISCOVERY_RECENT_PAGE_SIZE\)/);
  assert.match(workerSource, /compareAndSetRegistrationScanCursor/);
  assert.match(workerSource, /IS NOT DISTINCT FROM/);
  const discoveryStart = workerSource.indexOf('const discoverRegistrationPage');
  const discoveryEnd = workerSource.indexOf('const runRegistrationDiscoveryPage', discoveryStart);
  assert.doesNotMatch(
    workerSource.slice(discoveryStart, discoveryEnd),
    /GENERATED_MEDIA_ID_PATTERN\.test\(fileNameBase\)/,
  );
  const scanStart = workerSource.indexOf('const scanAndRegisterWithLease');
  const scanEnd = workerSource.indexOf('const scanAndRegister =', scanStart);
  assert.doesNotMatch(workerSource.slice(scanStart, scanEnd), /runRegistrationDiscoveryPage\(/);
  assert.match(workerSource, /if \(env\.REGISTRATION_SCHEDULED === '1'\)/);
});

test('Drive registration I/O is deadline-bound so a scan lease cannot stick forever', () => {
  assert.match(workerSource, /const REGISTRATION_STORAGE_TIMEOUT_MS = 30_000/);
  assert.match(workerSource, /DRIVE_COPY_VISIBILITY_ATTEMPTS = 3/);
  assert.match(workerSource, /DRIVE_RETRY_TARGET_VISIBILITY_ATTEMPTS = 3/);
  assert.match(workerSource, /DRIVE_COPY_VISIBILITY_DELAY_MS = 2000/);
  assert.equal(SCAN_LEASE_SECONDS, 90);
  assert.match(workerSource, /String\(SCAN_LEASE_SECONDS\)\} \|\| ' seconds'/);

  const listStart = workerSource.indexOf('const listStoragePage');
  const listEnd = workerSource.indexOf('const putObject', listStart);
  assert.match(
    workerSource.slice(listStart, listEnd),
    /signal: AbortSignal\.timeout\(REGISTRATION_STORAGE_TIMEOUT_MS\)/,
  );

  const finalizeStart = workerSource.indexOf('const finalizeDriveUpload');
  const finalizeEnd = workerSource.indexOf('const storageObjectExists', finalizeStart);
  assert.match(
    workerSource.slice(finalizeStart, finalizeEnd),
    /signal: AbortSignal\.timeout\(REGISTRATION_STORAGE_TIMEOUT_MS\)/,
  );

  const objectSizeStart = workerSource.indexOf('const storageObjectSize');
  const objectSizeEnd = workerSource.indexOf('const finalizeDriveUpload', objectSizeStart);
  assert.match(
    workerSource.slice(objectSizeStart, objectSizeEnd),
    /signal: AbortSignal\.timeout\(timeoutMs\)/,
  );
  assert.match(
    workerSource.slice(objectSizeStart, objectSizeEnd),
    /response\.status === 405 \|\| response\.status === 501/,
  );
  assert.match(
    workerSource.slice(objectSizeStart, objectSizeEnd),
    /listDriveObjectSize\(env, key, timeoutMs\)/,
  );
});

test('long scans keep their lease alive while hung scheduled invocations self-release', () => {
  assert.doesNotMatch(workerSource, /Promise\.race\(\[scanAndRegister\(env\), watchdog\]\)/);
  assert.doesNotMatch(workerSource, /Registration scan watchdog exceeded/);
  assert.match(workerSource, /startScanLeaseHeartbeat/);
  assert.match(workerSource, /setInterval\(heartbeat, intervalMs\)/);
  assert.match(workerSource, /await leaseHeartbeat\.stop\(\)/);
  assert.match(workerSource, /SCHEDULED_SCAN_DEADLINE_MS/);
  assert.match(workerSource, /scheduled_scan_circuit_breaker/);
  assert.match(workerSource, /keepScheduledScanBounded\(scan\.promise/);
});

test('observability database failures cannot disable scheduled registration', () => {
  const startScanStart = workerSource.indexOf('const startScan =');
  const startScanEnd = workerSource.indexOf('const scheduleScan =', startScanStart);
  const startScanSource = workerSource.slice(startScanStart, startScanEnd);
  assert.match(startScanSource, /logBackendActivity\(env, \{[\s\S]*event: 'scan_started'/);
  assert.match(startScanSource, /event: 'scan_started'[\s\S]*\.catch\(error =>/);
  assert.match(startScanSource, /event: 'scan_completed'[\s\S]*\.catch\(error =>/);
  assert.match(startScanSource, /event: 'scan_failed'[\s\S]*\.catch\(logError =>/);

  const scheduledStart = workerSource.indexOf('async scheduled(');
  const scheduledEnd = workerSource.indexOf('async fetch(', scheduledStart);
  const scheduledSource = workerSource.slice(scheduledStart, scheduledEnd);
  assert.match(scheduledSource, /scheduled_scan_skipped/);
  assert.doesNotMatch(scheduledSource, /getRuntimeProcessingSettingsForTrigger/);
});

test('scheduled scans do not share an in-memory promise across cron events', () => {
  assert.match(workerSource, /startScan\([\s\S]*?shareInFlight: false/);
  assert.match(workerSource, /if \(shareInFlight && scanInFlight\)/);
  assert.match(workerSource, /REGISTRATION_DISCOVERY_CRON/);
  assert.match(workerSource, /registration_claimed/);
  assert.match(workerSource, /registration_id_allocated/);
});

test('registration commit keeps media and source map in one SQL statement', () => {
  assert.match(workerSource, /const commitRegisteredMedia = async/);
  assert.match(workerSource, /WITH map_upsert AS/);
  assert.match(workerSource, /media_upsert AS/);
  assert.match(workerSource, /FROM map_upsert/);
});

test('source cleanup is bounded and deferred outside the registration claim', () => {
  assert.match(workerSource, /REGISTERED_SOURCE_CLEANUP_LIMIT = 4/);
  assert.match(workerSource, /cleanupRegisteredSourceFiles/);
  assert.match(workerSource, /waitUntil\(cleanup\)/);
  assert.match(workerSource, /registeredSourceUrls/);
});

test('tracked destinations require a verified size before commit', () => {
  assert.doesNotMatch(workerSource, /targetReadableWithoutSize/);
  assert.match(workerSource, /targetAlreadyRegistered = shouldVerifyExistingTarget &&/);
  assert.equal(isExactVerifiedStorageCopy(100, 100), true);
  assert.equal(isExactVerifiedStorageCopy(undefined, 100), false);
  assert.equal(isExactVerifiedStorageCopy(100, undefined), false);
});

test('stalled registration rows are requeued instead of left as permanent errors', () => {
  const staleStart = workerSource.indexOf('const clearStaleRegistrationStatuses');
  const staleEnd = workerSource.indexOf('const clearOldCompletedRegistrationStatuses', staleStart);
  const source = workerSource.slice(staleStart, staleEnd);

  assert.match(source, /status='detected'/);
  assert.match(source, /error_message=NULL/);
  assert.match(workerSource, /Previous registration attempt stalled; queued for retry/);
  // Transient Drive failures are requeued only while the durable attempt
  // counter is below the configured limit. Exhausted rows become actionable
  // errors and require an explicit retry.
  assert.match(source, /WHERE status='error'/);
  assert.match(source, /status='error'/);
  assert.match(source, /attempt_count/);
  assert.match(source, /retry it manually/);
});

test('manual retries explicitly requeue the matching registration record', () => {
  const retryStart = workerSource.indexOf("url.pathname === '/registration/retry'");
  const retryEnd = workerSource.indexOf("if (url.pathname === '/run'", retryStart);
  const source = workerSource.slice(retryStart, retryEnd);

  assert.match(source, /requeueRegistrationStatuses/);
  assert.match(source, /scheduleScan/);
  assert.match(workerSource, /status='detected'/);
});

test('Supabase scans use a fresh bounded client and retry a dropped connection', () => {
  assert.match(workerSource, /new Client\(/);
  assert.match(workerSource, /connectionTimeoutMillis: connectionTimeoutMs/);
  assert.match(workerSource, /query_timeout: queryTimeoutMs/);
  assert.match(workerSource, /isRetryableSupabaseConnectionError/);
  assert.match(workerSource, /SUPABASE_CONNECTION_RETRY_ATTEMPTS = 3/);
  assert.match(workerSource, /await client\.end\(\)\.catch/);
  assert.match(workerSource, /Postgres query failed after/);
  assert.match(workerSource, /describePostgresQuery/);
  assert.doesNotMatch(workerSource, /new Pool\(/);
});

test('scheduled registration does not compete with the deletion queue', () => {
  const scheduledStart = workerSource.indexOf('async scheduled(');
  const scheduledEnd = workerSource.indexOf('async fetch(', scheduledStart);
  const source = workerSource.slice(scheduledStart, scheduledEnd);

  assert.doesNotMatch(source, /const deletionDrain = startDeletionDrain\(scheduledEnv\)/);
  assert.match(source, /startScan\([\s\S]*?envWithRuntimeSettings\(scheduledEnv, settings\)[\s\S]*?shareInFlight: false/);
  assert.match(workerSource, /ctx\.waitUntil\(drain\.promise\.catch/);
  assert.match(workerSource, /continuing registration with cached prefixes/);
});

test('active processing rows are failed only after storage confirms missing', () => {
  assert.equal(shouldMarkProcessingSourceMissing({
    status: 'pending',
    sourceKey: 'uploads/video.mp4',
    isListed: false,
    exists: false,
  }), true);
  assert.equal(shouldMarkProcessingSourceMissing({
    status: 'processing',
    sourceKey: 'uploads/video.mp4',
    isListed: true,
  }), false);
  assert.equal(shouldMarkProcessingSourceMissing({
    status: 'pending',
    sourceKey: 'uploads/video.mp4',
    isListed: false,
    exists: undefined,
  }), false);
  assert.equal(shouldMarkProcessingSourceMissing({
    status: 'ready',
    sourceKey: '',
    isListed: false,
  }), false);
});

test('deletion prefixes cover nested media derivatives without sibling IDs', () => {
  assert.equal(deletionKeyMatchesPrefix(
    'uploads/token/123456789012-preview.mp4',
    'uploads/token/123456789012',
  ), true);
  assert.equal(deletionKeyMatchesPrefix(
    'uploads/token/123456789012-subtitles.json',
    'uploads/token/123456789012',
  ), true);
  assert.equal(deletionKeyMatchesPrefix(
    'uploads/token/1234567890123.mp4',
    'uploads/token/123456789012',
  ), false);
});

test('deletion treats an already-missing source as successfully removed', async () => {
  let removeCalls = 0;
  const result = await deleteStorageKeyIfPresent({
    exists: async () => false,
    remove: async () => { removeCalls += 1; },
  });
  assert.equal(result, 'already-missing');
  assert.equal(removeCalls, 0);
});

test('deletion removes redundant nested and derivative prefix scans', () => {
  assert.deepEqual(buildDeletionPrefixes(
    '464439787784',
    [
      '464439787784',
      '464439787784-poster',
      '464439787784-preview',
      'source-name',
    ],
    [
      'uploads/token/464439787784.mp4',
      '464439787784-poster.jpg',
      '464439787784-preview.mp4',
      'uploads/token/source-name.mp4',
    ],
  ), [
    '464439787784',
    'uploads/token/464439787784',
    'uploads/token/source-name',
  ]);
});

test('processor termination returns the claimed job to the retry queue', () => {
  assert.equal(
    shouldRetryInterruptedJob('Processor interrupted by SIGTERM'),
    true,
  );
  assert.equal(
    shouldRetryInterruptedJob('Drive put failed (524): upstream timeout'),
    true,
  );
  assert.equal(
    shouldRetryInterruptedJob('Drive put failed (403): permission denied'),
    false,
  );
  assert.equal(shouldRetryInterruptedJob('Unsupported video codec'), false);
});

test('scheduled maintenance requeues transient processing failures', () => {
  const start = workerSource.indexOf('const retryStaleProcessing');
  const end = workerSource.indexOf('let registeredUploadFileMapTableReady', start);
  const source = workerSource.slice(start, end);
  assert.match(source, /transcode_status='failed'/);
  assert.match(source, /drive\|storage/);
  assert.match(source, /5\[0-9\]\[0-9\]/);
  assert.match(source, /Transient processing failure was returned to the pending queue/);
});

test('processor stream uploads are restricted to safe derivative keys', () => {
  assert.equal(isAllowedStreamDerivativeKey('124399888136-stream.mp4'), true);
  assert.equal(isAllowedStreamDerivativeKey('show-name-stream.webm'), true);
  assert.equal(isAllowedStreamDerivativeKey('../source.mkv'), false);
  assert.equal(isAllowedStreamDerivativeKey('124399888136-preview.mp4'), false);
});

test('HLS VOD artifacts use stable, flat derivative keys', () => {
  assert.equal(isAllowedHlsDerivativeKey('movie-hls.m3u8'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-init.mp4'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-00001.m4s'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-high.m3u8'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-high-init.mp4'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-high-00001.m4s'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-720p.m3u8'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-720p-init.mp4'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-720p-00001.m4s'), true);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls/segment-00001.m4s'), false);
  assert.equal(isAllowedHlsDerivativeKey('movie-hls-random-init.mp4'), false);
});

test('HLS reconciliation is bounded and requires canonical delivery URLs', () => {
  const reconcileStart = workerSource.indexOf('const reconcileMissingHlsArtifacts');
  const reconcileEnd = workerSource.indexOf('const commitCanonicalVideo', reconcileStart);
  const source = workerSource.slice(reconcileStart, reconcileEnd);
  assert.match(source, /LIMIT 12/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /urlForKey\(env, key\) !== uri/);
  assert.match(source, /hls_verified_at/);
});

test('canonical processor uploads keep the media ID and plain mp4 name', () => {
  assert.equal(isAllowedProcessorUploadKey(
    'uploads/folder/123456789012.mp4',
    '123456789012',
  ), true);
  assert.equal(isAllowedProcessorUploadKey(
    'uploads/folder/123456789012-converted.mp4',
    '123456789012',
  ), false);
  assert.equal(isAllowedProcessorUploadKey(
    'uploads/folder/other.mp4',
    '123456789012',
  ), false);
});

test('subtitle upload metadata keeps named multi-track files and rejects unrelated paths', () => {
  assert.deepEqual(getValidSubtitleUploadMetadata(
    '124399888136',
    [
      { fileName: '124399888136-subtitles.eng.vtt', lang: 'eng', label: 'English Full' },
      { fileName: '124399888136-subtitles.eng-2.vtt', lang: 'eng', label: 'English Signs' },
      { fileName: '../outside.vtt', lang: 'eng', label: 'Unsafe' },
    ],
    [
      '124399888136-subtitles.eng.vtt',
      '124399888136-subtitles.eng-2.vtt',
      '../outside.vtt',
    ],
  ), [
    { fileName: '124399888136-subtitles.eng.vtt', lang: 'eng', label: 'English Full' },
    { fileName: '124399888136-subtitles.eng-2.vtt', lang: 'eng', label: 'English Signs' },
  ]);
});

test('new extracted subtitle metadata updates matching tracks and preserves manual tracks', () => {
  assert.deepEqual(mergeSubtitleManifestTracks(
    [
      { src: 'https://storage/1-subtitles.eng.vtt', lang: 'eng', label: 'Old English' },
      { src: 'https://storage/1-subtitles.custom.vtt', lang: 'custom', label: 'Custom' },
    ],
    [{ src: 'https://storage/1-subtitles.eng.vtt', lang: 'eng', label: 'English Full' }],
  ), [
    { src: 'https://storage/1-subtitles.eng.vtt', lang: 'eng', label: 'English Full' },
    { src: 'https://storage/1-subtitles.custom.vtt', lang: 'custom', label: 'Custom' },
  ]);
});

test('media ID allocation retries instead of overwriting an occupied ID', async () => {
  const candidates = ['111111111111', '222222222222'];
  const mediaId = await findAvailableMediaId(
    async attempt => candidates[attempt],
    new Set(['111111111111']),
  );

  assert.equal(mediaId, '222222222222');
});

test('re-uploading the same storage key creates a different media identity', async () => {
  const url = 'https://storage.example/uploads/repeated-name.mp4';
  const first = await stableMediaIdForUrl(url, new Date('2026-08-06T10:00:00Z'));
  const second = await stableMediaIdForUrl(url, new Date('2026-08-06T11:00:00Z'));

  assert.notEqual(first, second);
});

test('deferred cleanup never deletes a newer re-upload at the same key', () => {
  const mapUpdatedAt = new Date('2026-08-06T10:30:00Z');
  assert.equal(isDeferredSourceCleanupSafe(
    new Date('2026-08-06T10:00:00Z'),
    mapUpdatedAt,
  ), true);
  assert.equal(isDeferredSourceCleanupSafe(
    new Date('2026-08-06T11:00:00Z'),
    mapUpdatedAt,
  ), false);
});

test('an existing generated destination is trusted only when its size matches', () => {
  assert.equal(isVerifiedStorageCopy(100, 100), true);
  assert.equal(isVerifiedStorageCopy(undefined, 100), true);
  assert.equal(isVerifiedStorageCopy(100, 99), false);
  assert.equal(isVerifiedStorageCopy(100, undefined), false);
});

test('a matching destination size from the scan listing is sufficient', () => {
  assert.equal(isVerifiedStorageCopy(68, 68), true);
  assert.equal(isVerifiedStorageCopy(68, 0), false);
});

test('copy verification tolerates delayed Drive destination visibility', async () => {
  const observedSizes = [undefined, undefined, 68];
  let waits = 0;
  const destinationSize = await waitForVerifiedStorageCopy({
    sourceSize: 68,
    readDestinationSize: async () => observedSizes.shift(),
    attempts: 3,
    delayMs: 1,
    wait: async () => { waits += 1; },
  });

  assert.equal(destinationSize, 68);
  assert.equal(waits, 2);
});

test('Drive copy verification is short and resumable', () => {
  const coveredDelay =
    (DRIVE_COPY_VISIBILITY_ATTEMPTS - 1) * DRIVE_COPY_VISIBILITY_DELAY_MS;
  assert.ok(coveredDelay > 0 && coveredDelay <= 5_000);
});

test('a retry checks a tracked destination without holding the scan lease', () => {
  const coveredDelay =
    (DRIVE_RETRY_TARGET_VISIBILITY_ATTEMPTS - 1) *
    DRIVE_COPY_VISIBILITY_DELAY_MS;
  assert.ok(coveredDelay > 0 && coveredDelay <= 5_000);
});

test('an in-flight tracked Drive copy is not started a second time', () => {
  assert.equal(shouldWaitForTrackedRegistrationDestination({
    shouldVerifyExistingTarget: true,
    registrationStatus: 'registering',
    targetAlreadyRegistered: false,
  }), true);
  assert.equal(shouldWaitForTrackedRegistrationDestination({
    shouldVerifyExistingTarget: true,
    registrationStatus: 'registering',
    targetAlreadyRegistered: true,
  }), false);
  assert.equal(shouldWaitForTrackedRegistrationDestination({
    shouldVerifyExistingTarget: true,
    registrationStatus: 'error',
    targetAlreadyRegistered: false,
  }), false);
  assert.equal(shouldWaitForTrackedRegistrationDestination({
    shouldVerifyExistingTarget: true,
    registrationStatus: 'registering',
    targetAlreadyRegistered: false,
    retryStale: true,
  }), false);
});

test('delayed Drive copy visibility remains recoverable', () => {
  assert.equal(isRecoverableDriveCopyError(new Error(
    'Drive copy not ready: destination is still becoming readable',
  )), true);
  assert.equal(isRecoverableDriveCopyError(new Error(
    'Copied destination is not readable in storage: uploads/123.mkv',
  )), true);
  assert.equal(isRecoverableDriveCopyError(new Error(
    'Copied destination size mismatch: source=100 destination=50',
  )), true);
  assert.equal(isRecoverableDriveCopyError(new Error(
    'Drive copy failed (403)',
  )), false);
  assert.equal(isRecoverableDriveCopyError(new Error(
    'Drive copy failed (520): error code: 520',
  )), true);
});

test('a generated retry destination is not treated as a separate upload', () => {
  const sourceUrl = 'https://storage.example/staging/Original.png';
  const expectedUrl = 'https://storage.example/staging/123456789012.png';
  assert.equal(isProtectedRegistrationDestination({
    objectUrl: expectedUrl,
    sourceUrl,
    expectedUrl,
    sourceExists: true,
  }), true);
  assert.equal(isProtectedRegistrationDestination({
    objectUrl: expectedUrl,
    sourceUrl,
    expectedUrl,
    sourceExists: false,
  }), false);
});

test('a retry reuses the generated destination tied to its tracked media ID', () => {
  assert.equal(shouldVerifyExistingRegistrationDestination({
    sourceKey: 'staging/Original.png',
    destinationKey: 'staging/123456789012.png',
    mediaId: '123456789012',
    trackedMediaId: '123456789012',
    targetRecordedAsRegistered: false,
  }), true);
  assert.equal(shouldVerifyExistingRegistrationDestination({
    sourceKey: 'staging/Original.png',
    destinationKey: 'staging/123456789012.png',
    mediaId: '123456789012',
    trackedMediaId: '999999999999',
    targetRecordedAsRegistered: false,
  }), false);
});

test('registration prepares, commits, then cleans up in order', async () => {
  const events = [];

  await runSafeRegistrationCommit({
    prepareDestination: async () => { events.push('prepared'); },
    commitRegistration: async () => { events.push('committed'); },
    cleanupSource: async () => { events.push('cleaned'); },
  });

  assert.deepEqual(events, ['prepared', 'committed', 'cleaned']);
});

test('registration never deletes the source when destination preparation fails', async () => {
  let committed = false;
  let cleaned = false;

  await assert.rejects(() => runSafeRegistrationCommit({
    prepareDestination: async () => { throw new Error('copy failed'); },
    commitRegistration: async () => { committed = true; },
    cleanupSource: async () => { cleaned = true; },
  }), /copy failed/);

  assert.equal(committed, false);
  assert.equal(cleaned, false);
});

test('registration never deletes the source when the database commit fails', async () => {
  let cleaned = false;

  await assert.rejects(() => runSafeRegistrationCommit({
    prepareDestination: async () => undefined,
    commitRegistration: async () => { throw new Error('database failed'); },
    cleanupSource: async () => { cleaned = true; },
  }), /database failed/);

  assert.equal(cleaned, false);
});

test('a cleanup failure does not undo a safely committed registration', async () => {
  let cleanupError;

  await runSafeRegistrationCommit({
    prepareDestination: async () => undefined,
    commitRegistration: async () => undefined,
    cleanupSource: async () => { throw new Error('delete failed'); },
    onCleanupError: error => { cleanupError = error; },
  });

  assert.match(cleanupError.message, /delete failed/);
});
