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
    <label className="grid min-h-14 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3">
      <span className="min-w-0 pr-2">
        <span className="block font-medium leading-5 text-main">{label}</span>
        <span className="mt-0.5 block text-sm leading-5 text-dim">
          {description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={clsx(
          'w-[4.25rem] text-right text-[0.68rem] font-medium uppercase tracking-wide',
          checked ? 'text-blue-600 dark:text-blue-400' : 'text-dim',
        )}>
          {checked ? 'Enabled' : 'Disabled'}
        </span>
        <span className="relative inline-flex h-6 w-10 shrink-0">
          <input
            type="checkbox"
            name={name}
            role="switch"
            aria-label={label}
            checked={checked}
            onChange={event => onChange(event.target.checked)}
            className="peer absolute size-px opacity-0"
          />
          <span
            aria-hidden="true"
            className={clsx(
              'pointer-events-none absolute inset-0 rounded-full bg-neutral-300 shadow-inner',
              'transition-colors dark:bg-neutral-700',
              'after:absolute after:left-1 after:top-1 after:size-4',
              'after:rounded-full after:bg-white after:shadow-sm',
              'after:transition-transform',
              'peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500',
              'peer-checked:after:translate-x-4',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500',
              'peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white',
              'dark:peer-focus-visible:ring-offset-black',
            )}
          />
        </span>
      </span>
    </label>
  );
}
