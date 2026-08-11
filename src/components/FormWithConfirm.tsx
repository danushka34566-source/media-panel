'use client';

import { useAppState } from '@/app/AppState';
import { ReactNode, useRef } from 'react';

export default function FormWithConfirm({
  action,
  confirmText,
  onSubmit,
  className,
  children,
}: {
  action: (formData: FormData) => void
  confirmText?: string
  onSubmit?: () => void
  className?: string
  children: ReactNode
}) {
  const { confirmDialog } = useAppState();
  const isConfirmedSubmitRef = useRef(false);

  return (
    <form
      action={action}
      onSubmit={async e => {
        if (!confirmText) {
          onSubmit?.();
          return;
        }
        if (isConfirmedSubmitRef.current) {
          isConfirmedSubmitRef.current = false;
          onSubmit?.();
          return;
        }
        e.preventDefault();
        const didConfirm = await confirmDialog?.({
          description: confirmText,
          tone: 'danger',
        });
        if (didConfirm) {
          isConfirmedSubmitRef.current = true;
          e.currentTarget.requestSubmit();
        }
      }}
      className={className}
    >
      {children}
    </form>
  );
};
