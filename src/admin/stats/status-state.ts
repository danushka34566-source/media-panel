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

export type BackendRegistrationStatus = {
  url?: string
  source_url?: string
  file_name?: string
  original_file_name?: string
  title?: string
  status?: 'detected' | 'registering' | 'error'
  media_id?: string
  extension?: string
  error_message?: string
  uploaded_at?: string
  updated_at?: string
};

export type BackendRegistrationQueue = {
  detected?: number
  registering?: number
  error?: number
  total?: number
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
  registrationOwner?: 'worker' | 'processor' | 'processor-waiting'
  processorOnlyRegistration?: boolean
  processorRegistrationEnabled?: boolean
  processors?: BackendProcessorStatus[]
  activeJobs?: BackendJobStatus[]
  deletionQueue?: Record<string, number>
  registrationQueue?: BackendRegistrationQueue
  registrationJobs?: BackendRegistrationStatus[]
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

const BACKEND_STATUS_CACHE_KEY = 'media-panel:backend-status:v1';

export const readCachedBackendStatusState = (): BackendStatusState => {
  if (typeof window === 'undefined') {
    return INITIAL_BACKEND_STATUS_STATE;
  }
  try {
    const value = window.localStorage.getItem(BACKEND_STATUS_CACHE_KEY);
    if (!value) { return INITIAL_BACKEND_STATUS_STATE; }
    const parsed = JSON.parse(value) as BackendStatusState;
    if (!parsed || typeof parsed !== 'object' || !parsed.lastConnected) {
      return INITIAL_BACKEND_STATUS_STATE;
    }
    return {
      latest: parsed.lastConnected,
      lastConnected: parsed.lastConnected,
      lastConnectedAt: parsed.lastConnectedAt,
      consecutiveFailures: 0,
    };
  } catch {
    return INITIAL_BACKEND_STATUS_STATE;
  }
};

export const writeCachedBackendStatusState = (state: BackendStatusState) => {
  if (typeof window === 'undefined' || !state.lastConnected) { return; }
  try {
    window.localStorage.setItem(BACKEND_STATUS_CACHE_KEY, JSON.stringify({
      lastConnected: state.lastConnected,
      lastConnectedAt: state.lastConnectedAt,
    }));
  } catch {
    // Storage can be disabled or full; live status must continue normally.
  }
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
