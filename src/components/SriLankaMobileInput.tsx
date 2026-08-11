import { clsx } from 'clsx/lite';

export const sriLankaMobileDigits = (value?: string) => {
  const digits = `${value ?? ''}`.replace(/\D/g, '');
  if (digits.startsWith('94')) { return digits.slice(2, 11); }
  if (digits.startsWith('0')) { return digits.slice(1, 10); }
  return digits.slice(0, 9);
};

export default function SriLankaMobileInput({
  value,
  defaultValue,
  onChange,
  name = 'mobileNumber',
  label = 'Mobile number',
  className,
  required,
}: {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  name?: string
  label?: string
  className?: string
  required?: boolean
}) {
  const isControlled = value !== undefined;

  return (
    <label className={clsx('block min-w-0 space-y-1', className)}>
      <span>{label}</span>
      <span
        className={clsx(
          'flex min-h-[2.4rem] items-stretch overflow-hidden rounded-lg',
          'border border-gray-200 bg-main',
          'focus-within:outline-2 focus-within:-outline-offset-2',
          'focus-within:outline-blue-600 dark:border-gray-700',
        )}
      >
        <span className="flex shrink-0 items-center border-r border-medium px-2.5 font-mono text-base text-main">
          +94
        </span>
        <input
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="tel-national"
          pattern="[0-9]{9}"
          maxLength={9}
          placeholder="7XXXXXXXX"
          required={required}
          {...isControlled
            ? { value: sriLankaMobileDigits(value) }
            : { defaultValue: sriLankaMobileDigits(defaultValue) }}
          onChange={event =>
            onChange?.(sriLankaMobileDigits(event.target.value))}
          className={clsx(
            'min-w-0 flex-1 rounded-none! border-0! bg-transparent!',
            'shadow-none! focus:outline-none!',
          )}
        />
      </span>
      <span className="block text-[11px] normal-case tracking-normal text-dim">
        Enter 9 digits without the leading 0.
      </span>
    </label>
  );
}
