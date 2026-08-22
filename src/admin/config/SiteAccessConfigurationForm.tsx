'use client';

import { useActionState, useState } from 'react';
import clsx from 'clsx/lite';
import type { SiteAccessSettings } from '@/auth/site-access-schema';
import {
  saveSiteAccessSettingsAction,
  type SiteAccessSettingsActionState,
} from '@/auth/site-access-actions';
import ConfigToggle from './ConfigToggle';

const initialState: SiteAccessSettingsActionState = {};

export default function SiteAccessConfigurationForm({
  settings,
}: {
  settings: SiteAccessSettings
}) {
  const [state, action, isPending] = useActionState(
    saveSiteAccessSettingsAction,
    initialState,
  );
  const [registrationsEnabled, setRegistrationsEnabled] = useState(
    settings.newRegistrationsEnabled,
  );
  const [loginVerificationRequired, setLoginVerificationRequired] = useState(
    settings.loginVerificationRequired,
  );

  return <form action={action} className="space-y-4">
    <label className="grid gap-2.5 py-1 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
      <span className="min-w-0">
        <span className="block font-medium leading-5 text-main">Website visibility</span>
        <span className="mt-1 block text-sm leading-5 text-dim">
          Private websites require an active account for all content.
        </span>
      </span>
      <select
        name="siteVisibility"
        defaultValue={settings.siteVisibility}
        className={clsx(
          'h-9 w-full rounded-lg border border-medium bg-main px-3',
          'text-main outline-hidden transition-colors',
          'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
        )}
      >
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
    </label>

    <div className="h-px bg-medium" />

    <ConfigToggle
      name="loginVerificationRequired"
      label="Sign-in verification"
      description="Require a verification code after every email and password sign-in."
      checked={loginVerificationRequired}
      onChange={setLoginVerificationRequired}
    />

    <div className="h-px bg-medium" />

    <ConfigToggle
      name="newRegistrationsEnabled"
      label="New registrations"
      description="Allow visitors to create accounts with credentials or Google."
      checked={registrationsEnabled}
      onChange={setRegistrationsEnabled}
    />

    <div className="flex flex-col gap-3 border-t border-medium pt-4 sm:flex-row sm:items-center sm:justify-between">
      <span className={clsx(
        'min-h-5 text-sm',
        state.error ? 'text-red-600' : 'text-dim',
      )}>
        {state.error || (state.saved ? 'Site access settings saved' : '')}
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
        {isPending ? 'Saving...' : 'Save access settings'}
      </button>
    </div>
  </form>;
}
