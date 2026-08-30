import { getProcessingSettingsSafe } from './settings';
import { getProcessingConnectionSettingsSafe } from './connection-settings';

export const hasProcessingOrchestrator = async () => {
  const settings = await getProcessingConnectionSettingsSafe();
  return Boolean(
    settings.orchestratorBaseUrl &&
    settings.orchestratorSharedSecret,
  );
};

export type ProcessingOrchestratorRunResult = {
  triggered: boolean
  registeringUrls?: string[]
};

export type ProcessingOrchestratorRecoveryResult =
  ProcessingOrchestratorRunResult & {
    scanStarted?: boolean
    requeued?: number
    statusMessage?: string
  };

export const runProcessingOrchestrator = async () => {
  const [settings, connection] = await Promise.all([
    getProcessingSettingsSafe(),
    getProcessingConnectionSettingsSafe(),
  ]);
  if (!settings.orchestratorEnabled || !settings.registrationEnabled) {
    return { triggered: false } satisfies ProcessingOrchestratorRunResult;
  }
  if (!connection.orchestratorBaseUrl || !connection.orchestratorSharedSecret) {
    return { triggered: false } satisfies ProcessingOrchestratorRunResult;
  }

  const baseUrl = connection.orchestratorBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      text || `Backend Orchestrator failed (${response.status})`,
    );
  }

  const data = await response.json().catch(() => ({})) as Omit<
    ProcessingOrchestratorRunResult,
    'triggered'
  >;
  return {
    triggered: true,
    ...data,
  } satisfies ProcessingOrchestratorRunResult;
};

export const runProcessingOrchestratorRecovery = async () => {
  const [settings, connection] = await Promise.all([
    getProcessingSettingsSafe(),
    getProcessingConnectionSettingsSafe(),
  ]);
  if (!settings.orchestratorEnabled || !settings.registrationEnabled) {
    return { triggered: false } satisfies ProcessingOrchestratorRecoveryResult;
  }
  if (!connection.orchestratorBaseUrl || !connection.orchestratorSharedSecret) {
    return { triggered: false } satisfies ProcessingOrchestratorRecoveryResult;
  }

  const baseUrl = connection.orchestratorBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/recovery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      text || `Backend Orchestrator recovery failed (${response.status})`,
    );
  }
  const recovery = await response.json().catch(() => ({})) as
    ProcessingOrchestratorRecoveryResult;
  // Requeue is committed before work starts. Keep the HTTP request connected
  // while the Worker performs one resumable pass; if this request is cut off,
  // the durable rows remain eligible for the next cron dispatch.
  const scanResponse = await fetch(
    `${baseUrl}/internal/scheduled-registration`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cron: '* * * * *' }),
      signal: AbortSignal.timeout(110_000),
    },
  );
  if (!scanResponse.ok) {
    const text = await scanResponse.text().catch(() => '');
    throw new Error(
      text ||
      `Backend Orchestrator recovery pass failed (${scanResponse.status})`,
    );
  }
  return {
    ...recovery,
    triggered: true,
    scanStarted: true,
    statusMessage: recovery.requeued
      ? `${recovery.requeued} incomplete registration${
        recovery.requeued === 1 ? '' : 's'
      } requeued; recovery pass completed`
      : 'Recovery pass completed',
  } satisfies ProcessingOrchestratorRecoveryResult;
};

export const retryWorkerRegistration = async ({
  url,
  sourceUrl,
}: {
  url: string
  sourceUrl?: string
}) => {
  const connection = await getProcessingConnectionSettingsSafe();
  if (!connection.orchestratorBaseUrl || !connection.orchestratorSharedSecret) {
    return { triggered: false };
  }
  const baseUrl = connection.orchestratorBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/registration/retry`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, sourceUrl }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Registration retry failed (${response.status})`);
  }
  const recovery = await response.json().catch(() => ({}));
  const scanResponse = await fetch(
    `${baseUrl}/internal/scheduled-registration`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cron: '* * * * *' }),
      signal: AbortSignal.timeout(110_000),
    },
  );
  if (!scanResponse.ok) {
    const text = await scanResponse.text().catch(() => '');
    throw new Error(
      text || `Registration retry pass failed (${scanResponse.status})`,
    );
  }
  return {
    ...recovery,
    triggered: true,
    scanStarted: true,
  };
};

export const retryAllFailedProcessing = async () => {
  const connection = await getProcessingConnectionSettingsSafe();
  if (!connection.orchestratorBaseUrl || !connection.orchestratorSharedSecret) {
    return { triggered: false, requeued: 0 };
  }
  const baseUrl = connection.orchestratorBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/processing/retry-failed`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${connection.orchestratorSharedSecret}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to retry failed processing jobs');
  return { ...data, triggered: true };
};

export const retryAllFailedRegistrations = async () => {
  const connection = await getProcessingConnectionSettingsSafe();
  if (!connection.orchestratorBaseUrl || !connection.orchestratorSharedSecret) {
    return { triggered: false, requeued: 0 };
  }
  const baseUrl = connection.orchestratorBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/registration/retry-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${connection.orchestratorSharedSecret}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to retry failed registrations');
  return { ...data, triggered: true };
};

export const triggerProcessingOrchestrator = async () => {
  const result = await runProcessingOrchestrator();
  return result.triggered;
};

export const triggerDeletionOrchestrator = async () => {
  const connection = await getProcessingConnectionSettingsSafe();
  if (!connection.orchestratorBaseUrl || !connection.orchestratorSharedSecret) {
    return false;
  }
  const baseUrl = connection.orchestratorBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/deletions/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.orchestratorSharedSecret}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      text || `Backend deletion queue failed (${response.status})`,
    );
  }
  return true;
};
