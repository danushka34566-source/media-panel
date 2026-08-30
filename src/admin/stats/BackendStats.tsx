'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx/lite';
import {
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiHardDrive,
  FiList,
  FiRefreshCw,
  FiServer,
  FiTrash2,
} from 'react-icons/fi';
import ScoreCard from '@/components/ScoreCard';
import ScoreCardContainer from '@/components/ScoreCardContainer';
import ScoreCardRow from '@/components/ScoreCardRow';
import BackendLogsModal from './BackendLogsModal';
import BackendQueueModal from './BackendQueueModal';
import AdminRegistrationRetryButton from '../AdminRegistrationRetryButton';
import AdminRegistrationErrorButton from '../AdminRegistrationErrorButton';
import { toastSuccess, toastWarning } from '@/toast';
import LoaderButton from '@/components/primitives/LoaderButton';
import {
  INITIAL_BACKEND_STATUS_STATE,
  getBackendStatusSnapshot,
  isBackendStatusTransient,
  recordBackendStatusProbe,
  type BackendStatus,
} from './status-state';

const formatDate = (value?: string) => {
  if (!value) { return 'Not available'; }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const getProcessingProgress = (note?: string) => {
  const match = note?.match(/^(.*?):\s*(\d{1,3})%\s*$/);
  if (!match) { return undefined; }
  return {
    stage: match[1],
    percent: Math.min(99, Math.max(0, Number(match[2]))),
  };
};

const metric = (label: string, value: number, tone?: string) =>
  <div className="min-w-20 space-y-0.5">
    <div className={clsx('text-xl font-medium text-main', tone)}>{value}</div>
    <div className="text-xs uppercase tracking-wide text-dim">{label}</div>
  </div>;

export default function BackendStats({
  initialStatus,
}: {
  initialStatus?: BackendStatus
}) {
  const [statusState, setStatusState] = useState(
    initialStatus
      ? { ...INITIAL_BACKEND_STATUS_STATE, latest: initialStatus }
      : INITIAL_BACKEND_STATUS_STATE,
  );
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isRecoveryRunning, setIsRecoveryRunning] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [retryingFailedType, setRetryingFailedType] = useState<'processing' | 'registration'>();
  const [queueModal, setQueueModal] = useState<
    'registration' | 'processing' | undefined
  >();

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let inFlight = false;

    const schedule = (delay = 2_000) => {
      if (!active) { return; }
      timer = window.setTimeout(() => void refresh(), delay);
    };

    const refresh = async () => {
      if (!active || inFlight) { return; }
      if (document.visibilityState !== 'visible') {
        schedule();
        return;
      }
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 25_000);
      let probe: BackendStatus;
      try {
        // Request the bounded activity window explicitly. Older worker builds
        // defaulted this endpoint to a single active row; without the queued
        // rows the UI cannot fill the three-row activity preview.
        const response = await fetch('/api/processing/status?queueLimit=20', {
          cache: 'no-store',
          signal: controller.signal,
        });
        probe = await response.json().catch(() => ({
          configured: true,
          connected: false,
          error: `Status request failed (${response.status})`,
        }));
      } catch (error) {
        const aborted = controller.signal.aborted;
        probe = {
          configured: true,
          connected: false,
          errorCode: aborted ? 'timeout' : 'connection',
          error: aborted
            ? 'Status check timed out'
            : error instanceof Error ? error.message : 'Connection failed',
        };
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
      if (active) {
        setStatusState(state => recordBackendStatusProbe(state, probe));
        schedule(2_000);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !inFlight) {
        if (timer) { window.clearTimeout(timer); }
        schedule(0);
      }
    };

    const onFocus = () => {
      if (!inFlight) {
        if (timer) { window.clearTimeout(timer); }
        schedule(0);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    schedule(0);
    return () => {
      active = false;
      controller?.abort();
      if (timer) { window.clearTimeout(timer); }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const latest = statusState.latest;
  const snapshot = getBackendStatusSnapshot(statusState);
  const isTransient = isBackendStatusTransient(statusState);
  const isConnected = Boolean(latest?.connected && !latest?.storedSnapshot);
  const isConfigured = latest?.configured !== false;
  const processors = snapshot?.processors || [];
  const jobs = snapshot?.activeJobs || [];
  const deletionQueue = snapshot?.deletionQueue || {};
  const registrationQueue = snapshot?.registrationQueue || {};
  const registrationJobs = snapshot?.registrationJobs || [];
  const activeRegistrationJobs = registrationJobs.filter(
    job => job.status === 'registering',
  );
  const queuedRegistrationJobs = registrationJobs.filter(
    job => job.status !== 'registering',
  );
  const registrationPreviewJobs = activeRegistrationJobs.length >= 3
    ? activeRegistrationJobs
    : [
      ...activeRegistrationJobs,
      ...queuedRegistrationJobs.slice(0, Math.max(3 - activeRegistrationJobs.length, 0)),
    ];
  const activeProcessingJobs = jobs.filter(
    job => job.transcode_status === 'processing',
  );
  const queuedProcessingJobs = jobs.filter(
    job => job.transcode_status !== 'processing',
  );
  const processingPreviewJobs = activeProcessingJobs.length >= 3
    ? activeProcessingJobs
    : [
      ...activeProcessingJobs,
      ...queuedProcessingJobs.slice(0, Math.max(3 - activeProcessingJobs.length, 0)),
    ];
  const hasRegistrationQueue = Boolean(
    registrationJobs.length || registrationQueue.total,
  );
  const hasProcessingQueue = Boolean(
    jobs.length || snapshot?.pending || snapshot?.processing || snapshot?.failed,
  );

  const connectionText = useMemo(() => {
    if (!latest) { return 'Checking…'; }
    if (latest.storedSnapshot) {
      return `Last synced ${formatDate(latest.syncedAt || latest.checkedAt)}`;
    }
    if (!isConfigured) { return 'Not configured'; }
    if (isConnected) { return 'Connected'; }
    if (isTransient) {
      return `Last confirmed connected ${formatDate(
        statusState.lastConnected?.checkedAt,
      )}; ${latest.error || 'refresh delayed'}`;
    }
    return latest.error || 'Offline';
  }, [
    isConfigured,
    isConnected,
    isTransient,
    latest,
    statusState.lastConnected?.checkedAt,
  ]);

  const processorSummary = !latest
    ? 'Checking processor heartbeats…'
    : !isConfigured
      ? 'Backend Orchestrator is not configured'
      : !isConnected && !isTransient
        ? 'Processor status unavailable while the orchestrator is offline'
        : processors.length > 0
          ? `${processors.length} active processor${processors.length === 1 ? '' : 's'}`
          : isTransient
            ? 'No processors in the last successful status check'
            : 'No active processors';
  const registrationOwnerLabel = latest?.registrationOwner === 'processor'
    ? 'Backend processor'
    : latest?.registrationOwner === 'processor-waiting'
      ? 'Processor-only mode · waiting for processor'
      : latest?.registrationOwner === 'worker'
        ? 'Worker fallback'
        : 'Checking…';

  const runRecoveryScan = async () => {
    if (isRecoveryRunning) { return; }
    setIsRecoveryRunning(true);
    setRecoveryMessage(undefined);
    try {
      const response = await fetch('/api/processing/recovery', {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Unable to start registration recovery');
      }
      setRecoveryMessage(data.message || 'Registration recovery queued');
    } catch (error) {
      setRecoveryMessage(error instanceof Error
        ? error.message
        : 'Unable to start registration recovery');
    } finally {
      setIsRecoveryRunning(false);
    }
  };

  const retryAllFailed = async (type: 'processing' | 'registration') => {
    if (retryingFailedType) return;
    setRetryingFailedType(type);
    try {
      const response = await fetch('/api/processing/retry-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || 'Retry failed');
      toastSuccess(`Requeued ${data.requeued || 0} failed ${type} job${data.requeued === 1 ? '' : 's'}`);
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      toastWarning(error instanceof Error ? error.message : 'Unable to retry failed jobs');
    } finally {
      setRetryingFailedType(undefined);
    }
  };

  return <ScoreCardContainer>
    <ScoreCard title="Backend Orchestrator">
      <ScoreCardRow
        icon={<span className={clsx(
          'mt-1 block size-2.5 rounded-full',
          isConnected
            ? 'bg-green-500'
            : isTransient
              ? 'bg-amber-500'
              : latest ? 'bg-red-500' : 'bg-gray-400',
        )} />}
        content={<div className="space-y-0.5">
          <div className="font-medium">{connectionText}</div>
          {isTransient && <div className="text-xs text-amber-600 dark:text-amber-400">
            Keeping the last confirmed snapshot while automatic retry continues
          </div>}
        </div>}
      />
      <ScoreCardRow
        icon={<FiHardDrive size={17} />}
        content={<div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>Storage: {snapshot?.storageProvider || 'unknown'}</span>
          <span>Build: {snapshot?.build || 'unknown'}</span>
        </div>}
      />
      <ScoreCardRow
        icon={<FiClock size={17} />}
        content={<div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span>Last successful check: {formatDate(
            statusState.lastConnected?.checkedAt,
          )}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="button flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs normal-case tracking-normal"
              onClick={() => setIsLogsOpen(true)}
            >
              <FiFileText size={14} />
              View logs
            </button>
            <button
              type="button"
              className="button flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs normal-case tracking-normal"
              onClick={() => void runRecoveryScan()}
              disabled={isRecoveryRunning}
            >
              <FiRefreshCw
                size={14}
                className={isRecoveryRunning ? 'animate-spin' : undefined}
              />
              {isRecoveryRunning ? 'Queueing…' : 'Recovery scan'}
            </button>
          </div>
          {recoveryMessage && <div className="basis-full text-xs text-dim">
            {recoveryMessage}
          </div>}
        </div>}
      />
    </ScoreCard>

    <ScoreCard title="System workload">
      <ScoreCardRow
        icon={<FiActivity size={17} />}
        content={<div className="w-full space-y-2 py-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-dim">
              Media processing
            </div>
            {snapshot?.failed ? <LoaderButton
              className="button shrink-0 px-2 py-1 text-xs"
              hideText="never"
              isLoading={retryingFailedType === 'processing'}
              onClick={() => void retryAllFailed('processing')}
            >Retry all</LoaderButton> : null}
          </div>
          <div className="flex flex-wrap items-end gap-6">
            {metric('Pending', snapshot?.pending || 0)}
            {metric('Processing', snapshot?.processing || 0)}
            {metric('Failed', snapshot?.failed || 0, 'text-red-600')}
          </div>
        </div>}
      />
      <ScoreCardRow
        icon={<FiHardDrive size={17} />}
        content={<div className="w-full space-y-2 py-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-dim">
              Registration intake
            </div>
            {registrationQueue.error ? <button
              type="button"
              className="button shrink-0 px-2 py-1 text-xs"
              disabled={Boolean(retryingFailedType)}
              onClick={() => void retryAllFailed('registration')}
            >{retryingFailedType === 'registration' ? 'Retrying…' : 'Retry all'}</button> : null}
          </div>
          <div className="flex flex-wrap items-end gap-6">
            {metric('Detected', registrationQueue.detected || 0)}
            {metric(
              'Registering',
              registrationQueue.registering || 0,
              'text-amber-600',
            )}
            {metric(
              'Failed',
              registrationQueue.error || 0,
              'text-red-600',
            )}
          </div>
        </div>}
      />
      <ScoreCardRow
        icon={<FiTrash2 size={17} />}
        content={<div className="w-full space-y-2 py-1">
          <div className="text-xs font-medium uppercase tracking-wide text-dim">
            Deletion cleanup
          </div>
          <div className="flex flex-wrap gap-6">
            {metric('Pending', deletionQueue.pending || 0)}
            {metric('Deleting', deletionQueue.processing || 0)}
            {metric('Failed', deletionQueue.failed || 0, 'text-red-600')}
          </div>
        </div>}
      />
      <ScoreCardRow
        icon={<FiActivity size={17} />}
        content={<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>Registration owner: {registrationOwnerLabel}</span>
          {latest?.processorOnlyRegistration &&
            <span className="rounded-md bg-dim px-1.5 py-0.5 text-xs uppercase">
              Processor-only enabled
            </span>}
        </div>}
      />
    </ScoreCard>

    {hasRegistrationQueue && <ScoreCard title={<div className="flex w-full items-center justify-between gap-3">
      <span>Registration activity</span>
      <button
        type="button"
        className="button flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs normal-case tracking-normal"
        onClick={() => setQueueModal('registration')}
      >
        <FiList size={14} />
        View all
      </button>
    </div>}>
      {registrationPreviewJobs.length === 0
        ? <ScoreCardRow
          icon={<FiCheckCircle size={17} />}
          content="No files are currently waiting for registration"
        />
        : registrationPreviewJobs.map((job, index) => {
          const name = job.title || job.original_file_name || job.file_name ||
            'Unnamed upload';
          const status = job.status || 'detected';
          return <ScoreCardRow
            key={job.url || `${name}-${index}`}
            icon={<FiHardDrive size={17} className={clsx(
              status === 'registering' && 'text-amber-500',
              status === 'error' && 'text-red-500',
            )} />}
            content={<div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={name}>
                  {name}
                </span>
                <span className={clsx(
                  'shrink-0 rounded-md px-1.5 py-0.5 text-xs uppercase',
                  status === 'registering'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : status === 'error'
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      : 'bg-dim text-dim',
                )}>
                  {status}
                </span>
                {status === 'error' && job.url &&
                  <AdminRegistrationRetryButton
                    url={job.url}
                    sourceUrl={job.source_url}
                    originalFileName={job.original_file_name || job.file_name}
                    title={job.title}
                  />}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-dim">
                {job.extension && <span>{job.extension.toUpperCase()}</span>}
                {job.media_id && <span>Media: {job.media_id}</span>}
                <span>Uploaded: {formatDate(job.uploaded_at)}</span>
                <span>Updated: {formatDate(job.updated_at)}</span>
              </div>
              {job.error_message &&
                <div className="break-words text-xs text-red-600 dark:text-red-400">
                  {job.error_message}
                </div>}
            </div>}
          />;
        })}
    </ScoreCard>}

    <ScoreCard title="Processor workers">
      <ScoreCardRow icon={<FiServer size={17} />} content={processorSummary} />
      {processors.map((processor, index) => <ScoreCardRow
        key={processor.processor_id || index}
        icon={<FiCheckCircle size={17} className="text-green-500" />}
        content={<div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">
              {processor.processor_id || 'Unnamed processor'}
            </span>
            <span className="rounded-md bg-dim px-1.5 py-0.5 text-xs uppercase">
              {processor.state || 'idle'}
            </span>
          </div>
          <div className="text-xs text-dim">
            {processor.platform || 'Unknown platform'} · Last heartbeat{' '}
            {formatDate(processor.last_seen_at)}
          </div>
        </div>}
      />)}
    </ScoreCard>

    {hasProcessingQueue && <ScoreCard title={<div className="flex w-full items-center justify-between gap-3">
      <span>Media processing activity</span>
      <button
        type="button"
        className="button flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs normal-case tracking-normal"
        onClick={() => setQueueModal('processing')}
      >
        <FiList size={14} />
        View all
      </button>
    </div>}>
      {processingPreviewJobs.length === 0
        ? <ScoreCardRow
          icon={<FiCheckCircle size={17} />}
          content="No media is currently waiting for processing"
        />
        : processingPreviewJobs.map((job, index) => {
          const status = (job.transcode_status || 'unknown').toLowerCase();
          const showError = ['failed', 'error', 'missing'].includes(status) &&
            Boolean(job.transcode_error) &&
            !getProcessingProgress(job.transcode_error);
          return <ScoreCardRow
          key={job.id || index}
          icon={<FiActivity size={17} />}
          content={<div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {job.title || job.id || 'Untitled job'}
              </span>
              <span className="shrink-0 rounded-md bg-dim px-1.5 py-0.5 text-xs uppercase">
                {job.transcode_status || 'unknown'}
              </span>
            </div>
            {(() => {
              const progress = getProcessingProgress(job.transcode_error);
              if (!progress) { return null; }
              return <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs text-dim">
                  <span className="truncate">{progress.stage}</span>
                  <span className="shrink-0 tabular-nums">{progress.percent}%</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-dim"
                  role="progressbar"
                  aria-label={`${progress.stage} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                >
                  <div
                    className="h-full rounded-full bg-blue-600 transition-[width] duration-500 dark:bg-blue-400"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>;
            })()}
            <div className="text-xs text-dim">
              Updated: {formatDate(job.updated_at)}
            </div>
            </div>
            {showError && <AdminRegistrationErrorButton
              title={job.title || job.id || 'Processing error'}
              errorMessage={job.transcode_error as string}
              dialogTitle="Processing error"
            />}
          </div>}
        />;
        })}
    </ScoreCard>}

    {isLogsOpen && <BackendLogsModal onClose={() => setIsLogsOpen(false)} />}
    {queueModal && <BackendQueueModal
      type={queueModal}
      onClose={() => setQueueModal(undefined)}
    />}
  </ScoreCardContainer>;
}
