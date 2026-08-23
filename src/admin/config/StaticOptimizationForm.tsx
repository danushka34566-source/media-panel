'use client';

import { useActionState, useState } from 'react';
import clsx from 'clsx/lite';
import ConfigToggle from './ConfigToggle';
import {
  ApplicationSettingsActionState,
  saveApplicationSettingsAction,
} from '@/app/application-settings-actions';
import type { ApplicationSettings } from '@/app/application-settings';

const initialState: ApplicationSettingsActionState = {};

const OPTIONS = [
  {
    name: 'staticMediaPages' as const,
    label: 'Media pages',
    description: 'Pre-render public photo and video detail pages at build time.',
  },
  {
    name: 'staticMediaOgImages' as const,
    label: 'Media social images',
    description: 'Pre-render social preview images for individual media.',
  },
  {
    name: 'staticMediaCategories' as const,
    label: 'Category pages',
    description: 'Pre-render public album, tag, year, camera, and other category pages.',
  },
  {
    name: 'staticMediaCategoryOgImages' as const,
    label: 'Category social images',
    description: 'Pre-render social preview images for public category pages.',
  },
] as const;

export default function StaticOptimizationForm({
  settings,
}: {
  settings: ApplicationSettings
}) {
  const [state, action, isPending] = useActionState(
    saveApplicationSettingsAction,
    initialState,
  );
  const [values, setValues] = useState(settings);

  const enabledCount = Object.values(values).filter(Boolean).length;

  return <form action={action} className="space-y-4">
    <div className="overflow-hidden rounded-lg border-medium">
      <div className="border-b border-medium px-3 py-3 sm:px-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-dim">
          Public page generation
        </div>
        <p className="mt-1 text-sm leading-5 text-dim">
          Choose which public page and social-image types are generated during
          the next production build. Disabled types are generated on demand
          and revalidated normally.
        </p>
      </div>
      <div className="divide-y divide-medium px-3 sm:px-4">
        {OPTIONS.map(option => (
          <ConfigToggle
            key={option.name}
            name={option.name}
            label={option.label}
            description={option.description}
            checked={values[option.name]}
            onChange={checked => setValues(current => ({
              ...current,
              [option.name]: checked,
            }))}
          />
        ))}
      </div>
    </div>

    <div className="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className={clsx(
        'min-h-5 text-sm',
        state.error ? 'text-red-600' : 'text-dim',
      )}>
        {state.error || (state.saved
          ? 'Static optimization settings saved.'
          : `${enabledCount} of ${OPTIONS.length} options enabled`)}
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
        {isPending ? 'Saving…' : 'Save static settings'}
      </button>
    </div>
  </form>;
}
