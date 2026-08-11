'use client';

import Modal from './Modal';
import { ConfirmDialogOptions } from '@/app/AppState';
import { clsx } from 'clsx/lite';

export default function ConfirmModal({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmDialogOptions
  onCancel: () => void
  onConfirm: () => void
}) {
  const {
    title = 'Please Confirm',
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'default',
  } = options;

  return (
    <Modal
      anchor="center"
      onClose={onCancel}
      className={clsx(
        'w-[calc(100vw-1.5rem-2px)] sm:w-[min(32rem,90vw)]',
        'rounded-[1.25rem] p-0 overflow-hidden',
        'bg-white dark:bg-black',
      )}
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-main">
            {title}
          </h2>
          <div className="space-y-2 text-sm leading-6 text-medium">
            {description
              .split('\n')
              .filter(Boolean)
              .map((line, index) => (
                <p key={`${line}-${index}`}>
                  {line}
                </p>
              ))}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={clsx(
              'button',
              tone === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
