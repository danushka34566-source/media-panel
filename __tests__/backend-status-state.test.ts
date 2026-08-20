import {
  INITIAL_BACKEND_STATUS_STATE,
  getBackendStatusSnapshot,
  isBackendStatusTransient,
  recordBackendStatusProbe,
} from '@/admin/stats/status-state';

describe('backend status polling state', () => {
  it('keeps the last healthy snapshot through short transient failures', () => {
    const connected = recordBackendStatusProbe(
      INITIAL_BACKEND_STATUS_STATE,
      { connected: true, configured: true, pending: 4 },
      1_000,
    );
    const timedOut = recordBackendStatusProbe(
      connected,
      {
        connected: false,
        configured: true,
        errorCode: 'timeout',
        error: 'Status check timed out',
      },
      6_000,
    );

    expect(isBackendStatusTransient(timedOut, 6_000)).toBe(true);
    expect(getBackendStatusSnapshot(timedOut)?.pending).toBe(4);
  });

  it('preserves registration queue details through a transient probe failure', () => {
    const connected = recordBackendStatusProbe(
      INITIAL_BACKEND_STATUS_STATE,
      {
        connected: true,
        configured: true,
        registrationQueue: {
          detected: 38,
          registering: 1,
          error: 0,
          total: 39,
        },
        registrationJobs: [{
          title: 'oldest-file.mp4',
          status: 'registering',
        }],
      },
      1_000,
    );
    const timedOut = recordBackendStatusProbe(
      connected,
      { connected: false, configured: true, errorCode: 'timeout' },
      6_000,
    );

    const snapshot = getBackendStatusSnapshot(timedOut);
    expect(snapshot?.registrationQueue?.registering).toBe(1);
    expect(snapshot?.registrationJobs?.[0]?.title).toBe('oldest-file.mp4');
  });

  it('marks repeated failures as disconnected', () => {
    let state = recordBackendStatusProbe(
      INITIAL_BACKEND_STATUS_STATE,
      { connected: true, configured: true },
      1_000,
    );
    for (let index = 0; index < 3; index += 1) {
      state = recordBackendStatusProbe(
        state,
        { connected: false, configured: true, error: 'Offline' },
        2_000 + index,
      );
    }

    expect(isBackendStatusTransient(state, 5_000)).toBe(false);
  });

  it('does not preserve a connected state after configuration is removed', () => {
    const connected = recordBackendStatusProbe(
      INITIAL_BACKEND_STATUS_STATE,
      { connected: true, configured: true },
      1_000,
    );
    const unconfigured = recordBackendStatusProbe(
      connected,
      { configured: false },
      2_000,
    );

    expect(getBackendStatusSnapshot(unconfigured)).toBeUndefined();
    expect(unconfigured.consecutiveFailures).toBe(0);
  });
});
