import {
  BACKEND_ORCHESTRATOR_BASE_URL,
  BACKEND_ORCHESTRATOR_SHARED_SECRET,
} from '@/app/config';
import { getProcessingSettingsSafe } from './settings';

export const hasProcessingOrchestrator = () =>
  Boolean(
    BACKEND_ORCHESTRATOR_BASE_URL &&
    BACKEND_ORCHESTRATOR_SHARED_SECRET,
  );

export type ProcessingOrchestratorRunResult = {
  triggered: boolean
  registeringUrls?: string[]
};

export const runProcessingOrchestrator = async () => {
  const settings = await getProcessingSettingsSafe();
  if (!settings.orchestratorEnabled || !settings.registrationEnabled) {
    return { triggered: false } satisfies ProcessingOrchestratorRunResult;
  }
  if (!hasProcessingOrchestrator()) {
    return { triggered: false } satisfies ProcessingOrchestratorRunResult;
  }

  const baseUrl = BACKEND_ORCHESTRATOR_BASE_URL!.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BACKEND_ORCHESTRATOR_SHARED_SECRET}`,
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

export const triggerProcessingOrchestrator = async () => {
  const result = await runProcessingOrchestrator();
  return result.triggered;
};

export const triggerDeletionOrchestrator = async () => {
  if (!hasProcessingOrchestrator()) { return false; }
  const baseUrl = BACKEND_ORCHESTRATOR_BASE_URL!.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/deletions/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BACKEND_ORCHESTRATOR_SHARED_SECRET}`,
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
