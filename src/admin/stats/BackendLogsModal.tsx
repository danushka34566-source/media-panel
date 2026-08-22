'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx/lite';
import { FiRefreshCw, FiX } from 'react-icons/fi';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';

type BackendActivityLog = {
  id?: string | number
  category?: string
  event?: string
  status?: 'info' | 'success' | 'warning' | 'error'
  message?: string
  media_id?: string
  processor_id?: string
  details?: Record<string, unknown>
  created_at?: string
};

const statusClassName = (status?: BackendActivityLog['status']) => clsx(
  'inline-flex rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
  status === 'success' && 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  status === 'warning' && 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  status === 'error' && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  (!status || status === 'info') && 'bg-dim text-dim',
);

const formatDate = (value?: string) => {
  if (!value) { return 'Unknown time'; }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
};

export default function BackendLogsModal({
  onClose,
}: {
  onClose: () => void
}) {
  const [logs, setLogs] = useState<BackendActivityLog[]>([]);
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
        '/api/processing/logs?limit=500',
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Unable to load backend activity');
      }
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setLastRefreshAt(new Date().toISOString());
    } catch (refreshError) {
      setError(refreshError instanceof Error
        ? refreshError.message
        : 'Unable to load backend activity');
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

  return <Modal
    anchor="center"
    onClose={onClose}
    noPadding
    className={clsx(
      'w-[calc(100vw-1.5rem-2px)] sm:w-[min(52rem,94vw)]',
      'max-h-[min(46rem,calc(100dvh-2rem))] overflow-hidden',
      'rounded-[1.25rem] bg-white dark:bg-black',
    )}
  >
    <div className="flex max-h-[inherit] flex-col">
      <div className="flex items-center gap-3 border-b border-medium p-4 sm:px-5">
        <div className="min-w-0 grow">
          <h2 className="font-medium text-main">Backend activity logs</h2>
          <p className="text-sm text-dim">
            Registration, scans, processing, processors, and storage activity
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
          aria-label="Refresh activity logs"
        >
          {isLoading ? <Spinner /> : <FiRefreshCw size={15} />}
        </button>
        <button
          type="button"
          className="button flex size-9 items-center justify-center p-0"
          onClick={onClose}
          aria-label="Close activity logs"
        >
          <FiX size={17} />
        </button>
      </div>
      <div className="min-h-40 overflow-y-auto">
        {error && <div className="p-5 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>}
        {!error && !isLoading && logs.length === 0 &&
          <div className="p-8 text-center text-sm text-dim">
            No activity has been recorded since this worker version was deployed.
          </div>}
        {logs.map((log, index) => <div
          key={log.id ?? `${log.created_at}-${index}`}
          className="space-y-2 border-b border-medium p-4 last:border-b-0 sm:px-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={statusClassName(log.status)}>
              {log.status || 'info'}
            </span>
            <span className="text-xs uppercase tracking-wide text-dim">
              {log.category || 'backend'} / {log.event || 'activity'}
            </span>
            <span className="ml-auto text-xs text-dim">
              {formatDate(log.created_at)}
            </span>
          </div>
          <p className="break-words text-sm text-main">
            {log.message || 'Backend activity'}
          </p>
          {(log.media_id || log.processor_id) &&
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
              {log.media_id && <span>Media: {log.media_id}</span>}
              {log.processor_id && <span>Processor: {log.processor_id}</span>}
            </div>}
          {log.details && Object.keys(log.details).length > 0 &&
            <details className="text-xs text-dim">
              <summary className="cursor-pointer select-none">Details</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-dim p-3">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </details>}
        </div>)}
      </div>
    </div>
  </Modal>;
}
