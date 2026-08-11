'use client';

import LoaderButton from '@/components/primitives/LoaderButton';
import { toastSuccess, toastWarning } from '@/toast';
import { clsx } from 'clsx/lite';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FiTrash2 } from 'react-icons/fi';
import { useAppState } from '@/app/AppState';

export default function AdminRegistrationDeleteButton({
  url,
  sourceUrl,
}: {
  url: string
  sourceUrl?: string
}) {
  const router = useRouter();
  const { canDelete } = useAppState();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!canDelete) { return null; }

  return (
    <LoaderButton
      className={clsx(
        'inline-flex size-6 items-center justify-center',
        'rounded-full border',
        'border-red-300 dark:border-red-800',
        'text-red-600 dark:text-red-400',
        'hover:text-red-700 dark:hover:text-red-300',
      )}
      classNameIcon="min-w-0"
      icon={<FiTrash2 size={13} className="shrink-0" />}
      hideText="always"
      tooltip="Delete failed registration"
      confirmText="Delete this failed registration record?"
      onClick={async () => {
        setIsDeleting(true);
        try {
          const response = await fetch('/api/processing/registration-record', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              sourceUrl,
            }),
          });
          const data = await response.json().catch(() => ({})) as {
            error?: string
            statusMessage?: string
          };
          if (!response.ok) {
            toastWarning(
              data.error ||
              data.statusMessage ||
              'Unable to remove failed registration',
            );
            return;
          }
          toastSuccess(data.statusMessage || 'Failed registration removed');
          router.refresh();
        } catch (error) {
          toastWarning(
            error instanceof Error
              ? error.message
              : 'Unable to remove failed registration',
          );
        } finally {
          setIsDeleting(false);
        }
      }}
      isLoading={isDeleting}
    />
  );
}
