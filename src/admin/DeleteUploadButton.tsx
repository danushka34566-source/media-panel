'use client';

import { deleteUploadsAction } from '@/media/actions';
import DeleteButton from './DeleteButton';
import { useRouter } from 'next/navigation';
import { PATH_ADMIN_MEDIA } from '@/app/path';
import { ComponentProps, useState } from 'react';
import LoaderButton from '@/components/primitives/LoaderButton';
import { useAppState } from '@/app/AppState';

export default function DeleteUploadButton({
  urls,
  shouldRedirectToAdminMedia,
  onDeleteStart,
  onDelete,
  children,
  isLoading,
  ...props
}: {
  urls: string[]
  shouldRedirectToAdminMedia?: boolean
  onDeleteStart?: () => void
  onDelete?: (didFail?: boolean) => void
} & ComponentProps<typeof LoaderButton>) {
  const router = useRouter();
  const { canDelete } = useAppState();

  const [isDeleting, setIsDeleting] = useState(false);

  if (!canDelete) { return null; }

  return (
    <DeleteButton
      {...props}
      confirmText={urls.length === 1
        ? 'Are you sure you want to delete this upload?'
        : `Are you sure you want to delete all ${urls.length} uploads?`}
      onClick={() => {
        onDeleteStart?.();
        setIsDeleting(true);
        deleteUploadsAction(urls)
          .then(() => {
            onDelete?.();
            if (shouldRedirectToAdminMedia) {
              router.push(PATH_ADMIN_MEDIA);
            } else {
              setIsDeleting(false);
            }
          })
          .catch(() => {
            setIsDeleting(false);
            onDelete?.(true);
          });
      }}
      isLoading={isLoading ?? isDeleting}
    >
      {children}
    </DeleteButton>
  );
}
