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
  return {
    triggered: true,
    ...await response.json().catch(() => ({})),
  };
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
