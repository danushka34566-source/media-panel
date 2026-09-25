'use client';

import type { RefObject } from 'react';
import { useFormStatus } from 'react-dom';
import { clsx } from 'clsx/lite';

export default function AuthCodeField({
  id,
  label,
  value,
  onChange,
  inputRef,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const { pending } = useFormStatus();

  return (
    <div className="w-full space-y-2">
      <label htmlFor={id}>{label}</label>
      <div className="group relative flex w-full gap-1.5">
        {Array.from({ length: 6 }, (_, index) =>
          <span
            key={index}
            aria-hidden="true"
            className={clsx(
              'flex h-11 min-w-0 flex-1 items-center justify-center',
              'rounded-xl border border-medium bg-main font-mono text-lg text-main',
              'transition-colors group-focus-within:border-gray-400',
              'dark:group-focus-within:border-gray-500',
              index === 3 && 'ml-2',
            )}
          >
            {value[index] ?? ''}
          </span>,
        )}
        <input
          ref={inputRef}
          id={id}
          name={id}
          type="text"
          aria-label={label}
          value={value}
          onChange={event => onChange(
            event.target.value.replace(/\D/g, '').slice(0, 6),
          )}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          readOnly={pending}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
      </div>
    </div>
  );
}
