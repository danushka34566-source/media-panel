import { spawn } from 'node:child_process';
import { chmod, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const panelBaseUrl = (process.env.MEDIA_PANEL_BASE_URL || '')
  .trim().replace(/\/+$/, '');
const secret = (
  process.env.BACKEND_ORCHESTRATOR_SHARED_SECRET || ''
).trim();
if (!panelBaseUrl || !secret) {
  throw new Error(
    'MEDIA_PANEL_BASE_URL and BACKEND_ORCHESTRATOR_SHARED_SECRET are required',
  );
}

const response = await fetch(
  `${panelBaseUrl}/api/processing/deployment-config`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  },
);
if (!response.ok) {
  throw new Error(
    `Panel configuration request failed (${response.status}): ` +
    await response.text(),
  );
}
const config = await response.json();
if (!config || typeof config !== 'object' || Array.isArray(config)) {
  throw new Error('Panel returned an invalid worker configuration');
}

const configPath = join(tmpdir(), `backend-orchestrator-${randomUUID()}.json`);
await writeFile(configPath, JSON.stringify(config), 'utf8');
await chmod(configPath, 0o600).catch(() => undefined);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const wranglerEntry = join(
  scriptDirectory,
  '..',
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        wranglerEntry,
        'deploy',
        '--name',
        'media-panel',
        '--secrets-file',
        configPath,
      ],
      {
        stdio: 'inherit',
        env: process.env,
      },
    );
    child.once('error', reject);
    child.once('exit', code => code === 0
      ? resolve()
      : reject(new Error(`Wrangler deploy failed with exit code ${code}`)));
  });
} finally {
  await rm(configPath, { force: true });
}
