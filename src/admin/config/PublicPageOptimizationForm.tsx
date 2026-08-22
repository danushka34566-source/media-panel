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

  return <form action={action} className="space-y-3">
    <div className="rounded-lg border border-medium px-3 sm:px-4">
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className={clsx(
        'min-h-5 text-sm',
        state.error ? 'text-red-600' : 'text-dim',
      )}>
        {state.error || (state.saved
          ? 'Saved. The next production build will use this setting.'
          : '')}
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
        {isPending ? 'Saving…' : 'Save public page settings'}
      </button>
    </div>
  </form>;
}
