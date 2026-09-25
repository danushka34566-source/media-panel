'use client';

import type { RefObject } from 'react';
import { useFormStatus } from 'react-dom';

export default function AuthCodeField({
  id,
  label,
  description,
  value,
  onChange,
  inputRef,
}: {
  id: string
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const { pending } = useFormStatus();

  return (
    <div className="w-full space-y-2 text-center">
      <label htmlFor={id} className="block text-center">{label}</label>
      {description && <p className="text-center text-sm text-medium">{description}</p>}
      <div className="group relative mx-auto flex w-fit max-w-full items-center gap-2">
        {[0, 1].map(group => <div key={group} className="auth-code-group flex">
          {[0, 1, 2].map(slot => {
            const index = group * 3 + slot;
            return <span
              key={index}
              aria-hidden="true"
              className="auth-code-slot flex h-12 w-[clamp(2rem,11vw,2.75rem)] shrink-0 items-center justify-center border-y border-r text-xl text-main transition-colors first:rounded-l-xl first:border-l last:rounded-r-xl group-focus-within:border-gray-400 dark:group-focus-within:border-gray-500"
            >
              {value[index] ?? ''}
            </span>;
          })}
        </div>)}
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-lg text-medium">&minus;</span>
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
