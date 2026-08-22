import 'server-only';

import {
  BACKEND_ORCHESTRATOR_BASE_URL,
  BACKEND_ORCHESTRATOR_SHARED_SECRET,
} from '@/app/config';
import { query } from '@/platforms/postgres';
import { ensureProcessingSettingsTable } from './settings';

export type ProcessingConnectionSettings = {
  orchestratorBaseUrl?: string
  orchestratorSharedSecret?: string
  processorSharedSecret?: string
};

const CONNECTION_KEYS = [
  'orchestratorBaseUrl',
  'orchestratorSharedSecret',
  'processorSharedSecret',
] as const;

const trim = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const envFallbacks: ProcessingConnectionSettings = {
  orchestratorBaseUrl: trim(BACKEND_ORCHESTRATOR_BASE_URL),
  orchestratorSharedSecret: trim(BACKEND_ORCHESTRATOR_SHARED_SECRET),
  processorSharedSecret: trim(process.env.BACKEND_PROCESSOR_SHARED_SECRET),
};

export const normalizeOrchestratorBaseUrl = (value: unknown) => {
  const normalized = trim(value);
  if (!normalized) { return undefined; }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Backend Orchestrator URL must be a valid http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Backend Orchestrator URL must use http or https');
  }
  return url.toString().replace(/\/+$/, '');
};

export const getProcessingConnectionSettings = async (): Promise<ProcessingConnectionSettings> => {
  await ensureProcessingSettingsTable();
  const { rows } = await query<{ key: string, value: string }>(`
    SELECT key, value
    FROM processing_configuration
    WHERE key = ANY($1::text[])
  `, [CONNECTION_KEYS]);
  const stored = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return {
    orchestratorBaseUrl: normalizeOrchestratorBaseUrl(
      stored.orchestratorBaseUrl ?? envFallbacks.orchestratorBaseUrl,
    ),
    orchestratorSharedSecret: trim(
      stored.orchestratorSharedSecret ?? envFallbacks.orchestratorSharedSecret,
    ),
    processorSharedSecret: trim(
      stored.processorSharedSecret ?? envFallbacks.processorSharedSecret,
    ),
  };
};

export const getProcessingConnectionSettingsSafe = async () =>
  getProcessingConnectionSettings().catch(() => ({ ...envFallbacks }));

export const saveProcessingConnectionSettings = async (
  updates: ProcessingConnectionSettings,
) => {
  await ensureProcessingSettingsTable();
  const values: Array<[string, string | undefined]> = [
    ['orchestratorBaseUrl', updates.orchestratorBaseUrl === undefined
      ? undefined
      : normalizeOrchestratorBaseUrl(updates.orchestratorBaseUrl)],
    ['orchestratorSharedSecret', trim(updates.orchestratorSharedSecret)],
    ['processorSharedSecret', trim(updates.processorSharedSecret)],
  ];
  for (const [key, value] of values) {
    if (value === undefined) { continue; }
    await query(`
      INSERT INTO processing_configuration (key, value, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (key) DO UPDATE SET
        value=EXCLUDED.value,
        updated_at=now()
    `, [key, value]);
  }
};
