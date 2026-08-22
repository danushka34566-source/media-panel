'use client';

import { useActionState, useState } from 'react';
import clsx from 'clsx/lite';
import {
  PROCESSING_NUMBER_LIMITS,
  ProcessingSettings,
} from '@/processing/settings-schema';
import {
  ProcessingSettingsActionState,
  saveProcessingSettingsAction,
} from '@/processing/settings-actions';
import ConfigToggle from './ConfigToggle';

const initialState: ProcessingSettingsActionState = {};

const NumberSetting = ({
  name,
  label,
  description,
  defaultValue,
  suffix,
}: {
  name: keyof typeof PROCESSING_NUMBER_LIMITS
  label: string
  description: string
  defaultValue: number
  suffix?: string
}) => {
  const [min, max] = PROCESSING_NUMBER_LIMITS[name];
  return <label
    className="grid gap-2.5 py-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center"
  >
    <span className="min-w-0">
      <span className="block font-medium leading-5 text-main">{label}</span>
      <span className="mt-1 block text-sm leading-5 text-dim">{description}</span>
    </span>
    <span className="flex min-w-0 items-center gap-2">
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className={clsx(
          'h-9 min-w-0 grow rounded-lg border border-medium bg-main px-3',
          'text-right text-main outline-hidden transition-colors',
          'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
        )}
      />
      {suffix && <span className="min-w-[2.75rem] text-xs text-dim">{suffix}</span>}
    </span>
  </label>;
};

const TextSetting = ({
  name,
  label,
  description,
  defaultValue,
  placeholder,
  type = 'text',
}: {
  name: string
  label: string
  description: string
  defaultValue?: string
  placeholder?: string
  type?: 'text' | 'url' | 'password'
}) => <label
  className="grid gap-2.5 py-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center"
>
  <span className="min-w-0">
    <span className="block font-medium leading-5 text-main">{label}</span>
    <span className="mt-1 block text-sm leading-5 text-dim">{description}</span>
  </span>
  <input
    type={type}
    name={name}
    defaultValue={defaultValue}
    placeholder={placeholder}
    autoComplete={type === 'password' ? 'new-password' : undefined}
    className={clsx(
      'h-9 min-w-0 w-full rounded-lg border border-medium bg-main px-3',
      'text-main outline-hidden transition-colors',
      'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
    )}
  />
</label>;

export default function ProcessingConfigurationForm({
  settings,
  connectionSettings,
}: {
  settings: ProcessingSettings
  connectionSettings?: {
    orchestratorBaseUrl?: string
    hasOrchestratorSecret: boolean
    hasProcessorSecret: boolean
  }
}) {
  const [state, action, isPending] = useActionState(
    saveProcessingSettingsAction,
    initialState,
  );
  const [orchestratorEnabled, setOrchestratorEnabled] = useState(
    settings.orchestratorEnabled,
  );
  const [registrationEnabled, setRegistrationEnabled] = useState(
    settings.registrationEnabled,
  );
  const [videoProcessingEnabled, setVideoProcessingEnabled] = useState(
    settings.videoProcessingEnabled,
  );

  return <form action={action} className="space-y-6">
    <div className="rounded-lg border border-medium px-3 sm:px-4">
      <div className="border-b border-medium py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-dim">
          Connection
        </div>
        <p className="mt-1 text-sm leading-5 text-dim">
          These values override environment variables and are stored in the
          project database. Secret fields stay masked; leave them blank to
          keep the current secret.
        </p>
      </div>
      <TextSetting
        name="orchestratorBaseUrl"
        label="Orchestrator URL"
        description="Public URL of the deployed Cloudflare Worker."
        defaultValue={connectionSettings?.orchestratorBaseUrl}
        placeholder="https://worker.example.workers.dev"
        type="url"
      />
      <TextSetting
        name="orchestratorSharedSecret"
        label="Panel key"
        description={connectionSettings?.hasOrchestratorSecret
          ? 'Configured — enter a new value only to rotate it.'
          : 'Shared secret used by the panel and orchestrator.'}
        placeholder={connectionSettings?.hasOrchestratorSecret
          ? 'Configured — leave blank to keep'
          : 'Enter panel key'}
        type="password"
      />
      <TextSetting
        name="processorSharedSecret"
        label="Processor key"
        description={connectionSettings?.hasProcessorSecret
          ? 'Configured — enter a new value only to rotate it.'
          : 'Shared secret used by the orchestrator and processors.'}
        placeholder={connectionSettings?.hasProcessorSecret
          ? 'Configured — leave blank to keep'
          : 'Enter processor key'}
        type="password"
      />
    </div>

    <div className="divide-y divide-medium rounded-lg border border-medium px-3 sm:px-4">
      <ConfigToggle
        name="orchestratorEnabled"
        label="Backend Orchestrator"
        description="Allow the panel to trigger the Cloudflare orchestrator."
        checked={orchestratorEnabled}
        onChange={setOrchestratorEnabled}
      />
      <ConfigToggle
        name="registrationEnabled"
        label="Storage scanning and registration"
        description="Detect and register new image and video uploads."
        checked={registrationEnabled}
        onChange={setRegistrationEnabled}
      />
      <ConfigToggle
        name="videoProcessingEnabled"
        label="Video processing"
        description="Allow processors to claim pending video jobs."
        checked={videoProcessingEnabled}
        onChange={setVideoProcessingEnabled}
      />
    </div>

    <div className="rounded-lg border border-medium px-3 sm:px-4">
      <div className="border-b border-medium py-3 text-xs font-semibold uppercase tracking-wide text-dim">
        Orchestrator
      </div>
      <NumberSetting
        name="registerBatchSize"
        label="Registration batch size"
        description="Maximum uploads registered in one scan pass."
        defaultValue={settings.registerBatchSize}
      />
      <NumberSetting
        name="maxRegisterPasses"
        label="Maximum registration passes"
        description="Registration passes performed by one scan."
        defaultValue={settings.maxRegisterPasses}
      />
      <NumberSetting
        name="staleProcessingMinutes"
        label="Processing recovery lease"
        description="Requeue a job after heartbeats stop for this long."
        defaultValue={settings.staleProcessingMinutes}
        suffix="min"
      />
      <NumberSetting
        name="staleRegistrationMinutes"
        label="Registration recovery lease"
        description="Mark an abandoned registration attempt as stalled."
        defaultValue={settings.staleRegistrationMinutes}
        suffix="min"
      />
      <NumberSetting
        name="registrationHistoryDays"
        label="Registration history"
        description="Keep completed registration tracking for this long."
        defaultValue={settings.registrationHistoryDays}
        suffix="days"
      />
    </div>

    <div className="rounded-lg border border-medium px-3 sm:px-4">
      <div className="border-b border-medium py-3 text-xs font-semibold uppercase tracking-wide text-dim">
        Backend Processors
      </div>
      <NumberSetting
        name="processorPollIntervalMs"
        label="Active polling interval"
        description="Delay after a processor completes a job."
        defaultValue={settings.processorPollIntervalMs}
        suffix="ms"
      />
      <NumberSetting
        name="processorIdleIntervalMs"
        label="Idle polling interval"
        description="Delay when no processing job is available."
        defaultValue={settings.processorIdleIntervalMs}
        suffix="ms"
      />
      <NumberSetting
        name="processorHeartbeatIntervalMs"
        label="Heartbeat interval"
        description="How often a processor renews its active-job lease."
        defaultValue={settings.processorHeartbeatIntervalMs}
        suffix="ms"
      />
      <NumberSetting
        name="processorClaimLimit"
        label="Jobs claimed per processor"
        description="Concurrent jobs assigned to each polling processor."
        defaultValue={settings.processorClaimLimit}
      />
    </div>

    <div
      className={clsx(
        'flex flex-col gap-3 border-t border-medium pt-4',
        'sm:flex-row sm:items-center sm:justify-between',
      )}
    >
      <span className={clsx(
        'min-h-5 text-sm',
        state.error ? 'text-red-600' : 'text-dim',
      )}>
        {state.error || (state.saved ? 'Configuration saved' : '')}
      </span>
      <button
        type="submit"
        disabled={isPending}
        className={clsx(
          'inline-flex h-9 items-center justify-center rounded-lg bg-main px-4',
          'text-sm font-medium text-inverse transition-opacity',
          'hover:opacity-85 disabled:cursor-wait disabled:opacity-60',
        )}
      >
        {isPending ? 'Saving…' : 'Save processing configuration'}
      </button>
    </div>
  </form>;
}
