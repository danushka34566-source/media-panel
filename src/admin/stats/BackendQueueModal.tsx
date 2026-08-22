'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx/lite';
import { FiActivity, FiHardDrive, FiRefreshCw, FiX } from 'react-icons/fi';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';
import type {
  BackendJobStatus,
  BackendRegistrationStatus,
} from './status-state';

type QueueType = 'registration' | 'processing';

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

const statusClassName = (status?: string) => clsx(
  'shrink-0 rounded-md px-1.5 py-0.5 text-xs uppercase',
  status === 'registering' || status === 'processing'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    : status === 'error' || status === 'failed'
      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
      : 'bg-dim text-dim',
);

export default function BackendQueueModal({
  type,
  onClose,
}: {
  type: QueueType
  onClose: () => void
}) {
  const [registrationJobs, setRegistrationJobs] = useState<BackendRegistrationStatus[]>([]);
  const [processingJobs, setProcessingJobs] = useState<BackendJobStatus[]>([]);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshAt, setLastRefreshAt] = useState<string>();
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) { return; }
    inFlightRef.current = true;
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        '/api/processing/status?queueLimit=5000',
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Unable to load queue');
      }
      setRegistrationJobs(Array.isArray(data.registrationJobs)
        ? data.registrationJobs
        : []);
      setProcessingJobs(Array.isArray(data.activeJobs) ? data.activeJobs : []);
      setLastRefreshAt(new Date().toISOString());
    } catch (refreshError) {
      setError(refreshError instanceof Error
        ? refreshError.message
        : 'Unable to load queue');
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const title = type === 'registration' ? 'Registration queue' : 'Processing queue';
  const jobs = type === 'registration' ? registrationJobs : processingJobs;

  return <Modal
    anchor="center"
    onClose={onClose}
    noPadding
    className={clsx(
      'w-[calc(100vw-1.5rem-2px)] sm:w-[min(58rem,94vw)]',
      'max-h-[min(48rem,calc(100dvh-2rem))] overflow-hidden',
      'rounded-[1.25rem] bg-white dark:bg-black',
    )}
  >
    <div className="flex max-h-[inherit] flex-col">
      <div className="flex items-center gap-3 border-b border-medium p-4 sm:px-5">
        <div className="min-w-0 grow">
          <h2 className="font-medium text-main">{title}</h2>
          <p className="text-sm text-dim">
            Fresh queue snapshot from the backend database
            <span className="ml-2 text-xs">
              {lastRefreshAt
                ? `Live · updated ${formatDate(lastRefreshAt)}`
                : 'Syncing…'}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="button flex size-9 items-center justify-center p-0"
          onClick={() => void refresh()}
          disabled={isLoading}
          aria-label={`Refresh ${title.toLowerCase()}`}
        >
          {isLoading ? <Spinner /> : <FiRefreshCw size={15} />}
        </button>
        <button
          type="button"
          className="button flex size-9 items-center justify-center p-0"
          onClick={onClose}
          aria-label="Close queue"
        >
          <FiX size={17} />
        </button>
      </div>
      <div className="min-h-40 overflow-y-auto">
        {error && <div className="p-5 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>}
        {!error && isLoading &&
          <div className="flex justify-center p-10"><Spinner /></div>}
        {!error && !isLoading && jobs.length === 0 &&
          <div className="p-8 text-center text-sm text-dim">
            No queued jobs
          </div>}
        {!error && jobs.map((job, index) => {
          if (type === 'registration') {
            const registration = job as BackendRegistrationStatus;
            const name = registration.title ||
              registration.original_file_name || registration.file_name ||
              'Unnamed upload';
            const status = registration.status || 'detected';
            return <div
              key={registration.url || `${name}-${index}`}
              className="flex gap-3 border-b border-medium p-4 last:border-b-0 sm:px-5"
            >
              <FiHardDrive size={17} className={clsx(
                'mt-1 shrink-0',
                status === 'registering' && 'text-amber-500',
                status === 'error' && 'text-red-500',
              )} />
              <div className="min-w-0 grow space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm text-main">
                    {name}
                  </span>
                  <span className={statusClassName(status)}>{status}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-dim">
                  {registration.extension &&
                    <span>{registration.extension.toUpperCase()}</span>}
                  {registration.media_id && <span>Media: {registration.media_id}</span>}
                  <span>Uploaded: {formatDate(registration.uploaded_at)}</span>
                  <span>Updated: {formatDate(registration.updated_at)}</span>
                </div>
                {registration.error_message &&
                  <div className="break-words text-xs text-red-600 dark:text-red-400">
                    {registration.error_message}
                  </div>}
              </div>
            </div>;
          }
          const processing = job as BackendJobStatus;
          const status = processing.transcode_status || 'unknown';
          return <div
            key={processing.id || `${processing.title}-${index}`}
            className="flex gap-3 border-b border-medium p-4 last:border-b-0 sm:px-5"
          >
            <FiActivity size={17} className={clsx(
              'mt-1 shrink-0',
              status === 'processing' && 'text-amber-500',
              status === 'failed' && 'text-red-500',
            )} />
            <div className="min-w-0 grow space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-sm text-main">
                  {processing.title || processing.id || 'Untitled job'}
                </span>
                <span className={statusClassName(status)}>{status}</span>
              </div>
              {(() => {
                const progress = getProcessingProgress(processing.transcode_error);
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
              {processing.id &&
                <div className="text-xs text-dim">Media: {processing.id}</div>}
              {processing.transcode_error && !getProcessingProgress(processing.transcode_error) &&
                <div className="break-words text-xs text-dim">
                  {processing.transcode_error}
                </div>}
              {processing.updated_at &&
                <div className="text-xs text-dim">
                  Updated: {formatDate(processing.updated_at)}
                </div>}
            </div>
          </div>;
        })}
      </div>
    </div>
  </Modal>;
}
