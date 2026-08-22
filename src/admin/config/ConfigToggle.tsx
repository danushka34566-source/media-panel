'use client';

import clsx from 'clsx/lite';

export default function ConfigToggle({
  name,
  label,
  description,
  checked,
  onChange,
}: {
  name: string
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-5 text-main">{label}</span>
        <span className="mt-1 block text-sm leading-5 text-dim">
          {description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 pt-0.5">
        <span className={clsx(
          'min-w-[4.5rem] text-right text-xs font-medium uppercase tracking-wide',
          checked ? 'text-blue-600 dark:text-blue-400' : 'text-dim',
        )}>
          {checked ? 'Enabled' : 'Disabled'}
        </span>
        <span className="relative inline-flex h-6 w-11 shrink-0">
          <input
            type="checkbox"
            name={name}
            role="switch"
            aria-label={label}
            checked={checked}
            onChange={event => onChange(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={clsx(
              'pointer-events-none absolute inset-0 rounded-full bg-neutral-300',
              'transition-colors dark:bg-neutral-700',
              'after:absolute after:left-1 after:top-1 after:size-4',
              'after:rounded-full after:bg-white after:shadow-sm',
              'after:transition-transform',
              'peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500',
              'peer-checked:after:translate-x-5',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500',
              'peer-focus-visible:ring-offset-2',
            )}
          />
        </span>
      </span>
    </label>
  );
}
