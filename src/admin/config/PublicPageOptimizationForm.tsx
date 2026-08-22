'use client';

import { useActionState, useState } from 'react';
import clsx from 'clsx/lite';
import ConfigToggle from './ConfigToggle';
import {
  ApplicationSettingsActionState,
  saveApplicationSettingsAction,
} from '@/app/application-settings-actions';

const initialState: ApplicationSettingsActionState = {};

export default function PublicPageOptimizationForm({
  enabled,
}: {
  enabled: boolean
}) {
  const [state, action, isPending] = useActionState(
    saveApplicationSettingsAction,
    initialState,
  );
  const [publicPageBuildOptimizations, setPublicPageBuildOptimizations] =
    useState(enabled);

  return <form action={action} className="space-y-5">
    <div className="overflow-hidden rounded-lg border-medium px-3 sm:px-4">
      <ConfigToggle
        name="publicPageBuildOptimizations"
        label="Prebuild public pages"
        description="Generate every public media and category page during the
          next production build. When disabled, pages are generated on first
          visit and revalidated through ISR."
        checked={publicPageBuildOptimizations}
        onChange={setPublicPageBuildOptimizations}
      />
    </div>
    <div className="flex min-h-10 flex-col gap-3 border-t border-medium pt-4 sm:flex-row sm:items-center sm:justify-between">
      <span className={clsx(
        'min-h-5 text-sm',
        state.error ? 'text-red-600' : 'text-dim',
      )}>
        {state.error || (state.saved
          ? 'Application settings saved.'
          : '')}
      </span>
      <button
        type="submit"
        disabled={isPending}
        className={clsx(
          'inline-flex h-9 items-center justify-center rounded-lg bg-invert px-4',
          'text-sm font-medium text-invert transition-opacity',
          'hover:opacity-85 disabled:cursor-wait disabled:opacity-60',
        )}
      >
        {isPending ? 'Saving…' : 'Save performance settings'}
      </button>
    </div>
  </form>;
}
