import { clsx } from 'clsx/lite';
import { Command } from 'cmdk';
import { ReactNode } from 'react';
import Spinner from '../components/Spinner';

export default function CommandKItem({
  label,
  value,
  keywords,
  onSelect,
  accessory,
  annotation,
  annotationAria,
  loading,
  disabled,
}: {
  label: ReactNode
  value: string
  keywords?: string[]
  onSelect: () => void
  accessory?: ReactNode
  annotation?: ReactNode
  annotationAria?: string
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      className={clsx(
        'min-h-9 px-2 py-1.5 text-sm leading-5',
        'rounded-md cursor-pointer tracking-normal',
        'active:bg-gray-200/75! dark:active:bg-gray-800/55!',
        ...loading
          ? [
            'dark:data-[selected=true]:bg-gray-900/50',
            'data-[selected=true]:bg-gray-100/50',
          ] : [
            'dark:data-[selected=true]:bg-gray-900/75',
            'data-[selected=true]:bg-gray-100',
          ],
        disabled && 'opacity-15',
      )}
      onSelect={onSelect}
      disabled={loading || disabled}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center">
          {accessory}
        </span>
        <span className="min-w-0 grow truncate">
          {label}
        </span>
        {annotation && !loading &&
          <span
            className="shrink-0 whitespace-nowrap text-xs leading-5 text-dim"
            aria-label={annotationAria}
          >
            <span aria-hidden={Boolean(annotationAria)}>
              {annotation}
            </span>
          </span>}
        {loading &&
          <Spinner color="dim" />}
      </div>
    </Command.Item>
  );
}
