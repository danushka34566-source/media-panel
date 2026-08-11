'use client';

import Modal from '@/components/Modal';
import { clsx } from 'clsx/lite';
import { useState } from 'react';
import { FiAlertCircle } from 'react-icons/fi';

export default function AdminRegistrationErrorButton({
  title,
  errorMessage,
  dialogTitle = 'Registration error',
}: {
  title: string
  errorMessage: string
  dialogTitle?: string
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={clsx(
          'inline-flex size-6 items-center justify-center rounded-full border',
          'border-red-300 text-red-600 hover:text-red-700',
          'dark:border-red-800 dark:text-red-400 dark:hover:text-red-300',
        )}
        aria-label={`Show ${dialogTitle.toLocaleLowerCase()}`}
        title={`Show ${dialogTitle.toLocaleLowerCase()}`}
        onClick={() => setIsOpen(true)}
      >
        <FiAlertCircle size={14} className="shrink-0" />
      </button>
      {isOpen &&
        <Modal
          anchor="center"
          onClose={() => setIsOpen(false)}
          noPadding
          className={clsx(
            'w-[calc(100vw-1.5rem-2px)] sm:w-[min(32rem,90vw)]',
            'rounded-[1.25rem] p-0 overflow-hidden',
            'bg-white dark:bg-black',
          )}
        >
          <div className="space-y-5 p-5 sm:p-6">
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-main">
                {dialogTitle}
              </h2>
              <p className="truncate text-sm text-dim" title={title}>
                {title}
              </p>
              <p className="break-words text-sm leading-6 text-red-600 dark:text-red-400">
                {errorMessage}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="button"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>}
    </>
  );
}
