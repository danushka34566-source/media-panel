export type BackendProcessorStatus = {
  processor_id?: string
  platform?: string
  state?: string
  last_seen_at?: string
  started_at?: string
};

export type BackendJobStatus = {
  id?: string
  title?: string
  transcode_status?: string
  transcode_error?: string
  updated_at?: string
};

export type BackendStatus = {
  configured?: boolean
  connected?: boolean
  checkedAt?: string
  pending?: number
  processing?: number
  failed?: number
  error?: string
  errorCode?: 'timeout' | 'connection' | 'upstream'
  build?: string
  storageProvider?: 'drive' | 'cloudflare-r2'
  processors?: BackendProcessorStatus[]
  activeJobs?: BackendJobStatus[]
  deletionQueue?: Record<string, number>
  settings?: Record<string, string | number | boolean>
};

export type BackendStatusState = {
  latest?: BackendStatus
  lastConnected?: BackendStatus
  lastConnectedAt?: number
  consecutiveFailures: number
};

export const INITIAL_BACKEND_STATUS_STATE: BackendStatusState = {
  consecutiveFailures: 0,
};

export const recordBackendStatusProbe = (
  state: BackendStatusState,
  probe: BackendStatus,
  now = Date.now(),
): BackendStatusState => {
  if (probe.configured === false) {
    return {
      latest: probe,
      consecutiveFailures: 0,
    };
  }
  if (probe.connected) {
    return {
      latest: probe,
      lastConnected: probe,
      lastConnectedAt: now,
      consecutiveFailures: 0,
    };
  }
  return {
    ...state,
    latest: probe,
    consecutiveFailures: state.consecutiveFailures + 1,
  };
};

export const isBackendStatusTransient = (
  state: BackendStatusState,
  now = Date.now(),
) => Boolean(
  state.latest &&
  state.latest.configured !== false &&
  !state.latest.connected &&
  state.lastConnected &&
  state.lastConnectedAt &&
  state.consecutiveFailures < 3 &&
  now - state.lastConnectedAt <= 30_000,
);

export const getBackendStatusSnapshot = (
  state: BackendStatusState,
) => state.latest?.connected ? state.latest : state.lastConnected;
