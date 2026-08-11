'use client';

import { useActionState, useState } from 'react';
import clsx from 'clsx/lite';
import type { SiteAccessSettings } from '@/auth/site-access-schema';
import {
  saveSiteAccessSettingsAction,
  type SiteAccessSettingsActionState,
} from '@/auth/site-access-actions';

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
    <label className="grid gap-2 sm:grid-cols-[1fr_11rem] sm:items-center">
      <span>
        <span className="block font-medium text-main">Website visibility</span>
        <span className="block text-sm text-dim">
          Private websites require an active account for all content.
        </span>
      </span>
      <select
        name="siteVisibility"
        defaultValue={settings.siteVisibility}
        className={clsx(
          'w-full rounded-lg border border-medium bg-main px-3 py-2',
          'text-main outline-hidden focus:border-blue-500',
        )}
      >
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
    </label>

    <div className="h-px bg-medium" />

    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-medium text-main">
          Sign-in verification
        </span>
        <span className="block text-sm text-dim">
          Require a verification code after every email and password sign-in.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <input
          type="checkbox"
          name="loginVerificationRequired"
          aria-label="Require sign-in verification"
          checked={loginVerificationRequired}
          onChange={event =>
            setLoginVerificationRequired(event.target.checked)}
          className="peer sr-only"
        />
        <span className={clsx(
          'min-w-14 text-right text-sm font-medium',
          loginVerificationRequired
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-dim',
        )}>
          {loginVerificationRequired ? 'Enabled' : 'Disabled'}
        </span>
        <span
          className={clsx(
            'relative h-7 w-12 rounded-full bg-neutral-300 transition-colors',
            'after:absolute after:left-1 after:top-1 after:size-5',
            'after:rounded-full after:bg-white after:shadow-sm',
            'after:transition-transform peer-checked:bg-blue-600',
            'peer-checked:after:translate-x-5',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500',
            'peer-focus-visible:ring-offset-2 dark:bg-neutral-700',
            'dark:peer-checked:bg-blue-500',
          )}
        />
      </span>
    </label>

    <div className="h-px bg-medium" />

    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-medium text-main">New registrations</span>
        <span className="block text-sm text-dim">
          Allow visitors to create accounts with credentials or Google.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <input
          type="checkbox"
          name="newRegistrationsEnabled"
          aria-label="Enable new registrations"
          checked={registrationsEnabled}
          onChange={event => setRegistrationsEnabled(event.target.checked)}
          className="peer sr-only"
        />
        <span className={clsx(
          'min-w-14 text-right text-sm font-medium',
          registrationsEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-dim',
        )}>
          {registrationsEnabled ? 'Enabled' : 'Disabled'}
        </span>
        <span
          className={clsx(
            'relative h-7 w-12 rounded-full bg-neutral-300 transition-colors',
            'after:absolute after:left-1 after:top-1 after:size-5',
            'after:rounded-full after:bg-white after:shadow-sm',
            'after:transition-transform peer-checked:bg-blue-600',
            'peer-checked:after:translate-x-5',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500',
            'peer-focus-visible:ring-offset-2 dark:bg-neutral-700',
            'dark:peer-checked:bg-blue-500',
          )}
        />
      </span>
    </label>

    <div className="flex items-center justify-between gap-4 border-t border-medium pt-4">
      <span className={clsx(
        'text-sm',
        state.error ? 'text-red-600' : 'text-dim',
      )}>
        {state.error || (state.saved ? 'Site access settings saved' : '')}
      </span>
      <button
        type="submit"
        disabled={isPending}
        className={clsx(
          'rounded-md bg-main px-4 py-2 text-sm font-medium text-inverse',
          'hover:opacity-85 disabled:cursor-wait disabled:opacity-60',
        )}
      >
        {isPending ? 'Saving...' : 'Save access settings'}
      </button>
    </div>
  </form>;
}
