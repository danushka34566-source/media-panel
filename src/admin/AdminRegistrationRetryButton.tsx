'use client';

import LoaderButton from '@/components/primitives/LoaderButton';
import { toastSuccess, toastWarning } from '@/toast';
import { clsx } from 'clsx/lite';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FiRotateCcw } from 'react-icons/fi';

export default function AdminRegistrationRetryButton({
  url,
  sourceUrl,
  originalFileName,
  title,
}: {
  url: string
  sourceUrl?: string
  originalFileName?: string
  title?: string
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);

  return (
    <LoaderButton
      className={clsx(
        'inline-flex size-6 items-center justify-center',
        'rounded-full border',
        'border-gray-300 dark:border-gray-700',
        'text-dim hover:text-main',
      )}
      classNameIcon="min-w-0"
      icon={<FiRotateCcw size={13} className="shrink-0" />}
      hideText="always"
      tooltip="Retry registration"
      onClick={async () => {
        setIsRetrying(true);
        try {
          const retryUrl = sourceUrl || url;
          const response = await fetch('/api/processing/upload-hint', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              sourceUrl: retryUrl === url ? undefined : retryUrl,
              originalFileName,
              title,
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
              'Unable to retry registration',
            );
            return;
          }

          toastSuccess(data.statusMessage || 'Queued for worker scan');
          router.refresh();
        } catch (error) {
          toastWarning(
            error instanceof Error
              ? error.message
              : 'Unable to retry registration',
          );
        } finally {
          setIsRetrying(false);
        }
      }}
      isLoading={isRetrying}
    />
  );
}
