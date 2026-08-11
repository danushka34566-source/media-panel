'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx/lite';
import {
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiHardDrive,
  FiServer,
  FiTrash2,
} from 'react-icons/fi';
import ScoreCard from '@/components/ScoreCard';
import ScoreCardContainer from '@/components/ScoreCardContainer';
import ScoreCardRow from '@/components/ScoreCardRow';
import BackendLogsModal from './BackendLogsModal';
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

const metric = (label: string, value: number, tone?: string) =>
  <div className="min-w-20 space-y-0.5">
    <div className={clsx('text-xl font-medium text-main', tone)}>{value}</div>
    <div className="text-xs uppercase tracking-wide text-dim">{label}</div>
  </div>;

export default function BackendStats() {
  const [statusState, setStatusState] = useState(
    INITIAL_BACKEND_STATUS_STATE,
  );
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let inFlight = false;

    const schedule = (delay = 5_000) => {
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
        const response = await fetch('/api/processing/status', {
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
        schedule();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !inFlight) {
        if (timer) { window.clearTimeout(timer); }
        schedule(0);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    schedule(0);
    return () => {
      active = false;
      controller?.abort();
      if (timer) { window.clearTimeout(timer); }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const latest = statusState.latest;
  const snapshot = getBackendStatusSnapshot(statusState);
  const isTransient = isBackendStatusTransient(statusState);
  const isConnected = Boolean(latest?.connected);
  const isConfigured = latest?.configured !== false;
  const processors = snapshot?.processors || [];
  const jobs = snapshot?.activeJobs || [];
  const deletionQueue = snapshot?.deletionQueue || {};

  const connectionText = useMemo(() => {
    if (!latest) { return 'Connecting…'; }
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
        content={`Last successful check: ${formatDate(
          statusState.lastConnected?.checkedAt,
        )}`}
      />
    </ScoreCard>

    <ScoreCard title="Queues">
      <ScoreCardRow
        icon={<FiActivity size={17} />}
        content={<div className="flex flex-wrap gap-6 py-1">
          {metric('Pending', snapshot?.pending || 0)}
          {metric('Processing', snapshot?.processing || 0)}
          {metric('Failed', snapshot?.failed || 0, 'text-red-600')}
        </div>}
      />
      <ScoreCardRow
        icon={<FiTrash2 size={17} />}
        content={<div className="flex flex-wrap gap-6 py-1">
          {metric('Delete pending', deletionQueue.pending || 0)}
          {metric('Deleting', deletionQueue.processing || 0)}
          {metric('Delete failed', deletionQueue.failed || 0, 'text-red-600')}
        </div>}
      />
    </ScoreCard>

    <ScoreCard title="Backend Processors">
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

    <ScoreCard title="Processing Jobs">
      {jobs.length === 0
        ? <ScoreCardRow
          icon={<FiCheckCircle size={17} />}
          content="No pending, processing, or failed jobs"
        />
        : jobs.map((job, index) => <ScoreCardRow
          key={job.id || index}
          icon={<FiActivity size={17} />}
          content={<div className="space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {job.title || job.id || 'Untitled job'}
              </span>
              <span className="shrink-0 rounded-md bg-dim px-1.5 py-0.5 text-xs uppercase">
                {job.transcode_status || 'unknown'}
              </span>
            </div>
            {job.transcode_error &&
              <div className="break-words text-xs text-dim">
                {job.transcode_error}
              </div>}
          </div>}
        />)}
    </ScoreCard>

    <ScoreCard title="Activity">
      <ScoreCardRow
        icon={<FiFileText size={17} />}
        content={<div className="flex items-center justify-between gap-3">
          <div>
            <div>Backend activity logs</div>
            <div className="text-xs text-dim">
              Scans, registration, processing, processors, and deletions
            </div>
          </div>
          <button
            type="button"
            className="button shrink-0"
            onClick={() => setIsLogsOpen(true)}
          >
            View logs
          </button>
        </div>}
      />
    </ScoreCard>

    {isLogsOpen && <BackendLogsModal onClose={() => setIsLogsOpen(false)} />}
  </ScoreCardContainer>;
}
