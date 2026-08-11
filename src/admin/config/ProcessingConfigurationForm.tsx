'use client';

import { useActionState } from 'react';
import clsx from 'clsx/lite';
import {
  PROCESSING_NUMBER_LIMITS,
  ProcessingSettings,
} from '@/processing/settings-schema';
import {
  ProcessingSettingsActionState,
  saveProcessingSettingsAction,
} from '@/processing/settings-actions';

const initialState: ProcessingSettingsActionState = {};

const Toggle = ({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: keyof ProcessingSettings
  label: string
  description: string
  defaultChecked: boolean
}) => <label className="flex items-start justify-between gap-4 py-2">
  <span>
    <span className="block font-medium text-main">{label}</span>
    <span className="block text-sm text-dim">{description}</span>
  </span>
  <input
    type="checkbox"
    name={name}
    defaultChecked={defaultChecked}
    className="mt-1 size-4 accent-blue-600"
  />
</label>;

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
    className="grid gap-2 py-2 sm:grid-cols-[1fr_10rem] sm:items-center"
  >
    <span>
      <span className="block font-medium text-main">{label}</span>
      <span className="block text-sm text-dim">{description}</span>
    </span>
    <span className="flex items-center gap-2">
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className={clsx(
          'min-w-0 grow rounded-md border border-medium bg-main px-3 py-2',
          'text-right text-main outline-hidden focus:border-blue-500',
        )}
      />
      {suffix && <span className="w-7 text-xs text-dim">{suffix}</span>}
    </span>
  </label>;
};

export default function ProcessingConfigurationForm({
  settings,
}: {
  settings: ProcessingSettings
}) {
  const [state, action, isPending] = useActionState(
    saveProcessingSettingsAction,
    initialState,
  );

  return <form action={action} className="space-y-4">
    <div className="divide-y divide-medium">
      <Toggle
        name="orchestratorEnabled"
        label="Backend Orchestrator"
        description="Allow the panel to trigger the Cloudflare orchestrator."
        defaultChecked={settings.orchestratorEnabled}
      />
      <Toggle
        name="registrationEnabled"
        label="Storage scanning and registration"
        description="Detect and register new image and video uploads."
        defaultChecked={settings.registrationEnabled}
      />
      <Toggle
        name="videoProcessingEnabled"
        label="Video processing"
        description="Allow processors to claim pending video jobs."
        defaultChecked={settings.videoProcessingEnabled}
      />
    </div>

    <div className="border-t border-medium pt-3">
      <div className="pb-1 font-bold text-main">Orchestrator</div>
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

    <div className="border-t border-medium pt-3">
      <div className="pb-1 font-bold text-main">Backend Processors</div>
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
        'flex items-center justify-between gap-4 border-t',
        'border-medium pt-4',
      )}
    >
      <span className={clsx(
        'text-sm',
        state.error ? 'text-red-600' : 'text-dim',
      )}>
        {state.error || (state.saved ? 'Configuration saved' : '')}
      </span>
      <button
        type="submit"
        disabled={isPending}
        className={clsx(
          'rounded-md bg-main px-4 py-2 text-sm font-medium text-inverse',
          'hover:opacity-85 disabled:cursor-wait disabled:opacity-60',
        )}
      >
        {isPending ? 'Saving…' : 'Save processing configuration'}
      </button>
    </div>
  </form>;
}
