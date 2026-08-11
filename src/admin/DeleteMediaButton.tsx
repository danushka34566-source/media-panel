'use client';

import { deleteConfirmationTextForMedia, Media, titleForMedia } from '@/media';
import DeleteMediaButtonGroup from './DeleteMediaButtonGroup';
import { ComponentProps } from 'react';
import { useAppText } from '@/i18n/state/client';

export default function DeleteMediaButton({
  photo,
  ...rest
}: {
  photo: Media
} & ComponentProps<typeof DeleteMediaButtonGroup>) {
  const appText = useAppText();
  return (
    <DeleteMediaButtonGroup
      {...rest}
      photoIds={[photo.id]}
      confirmText={deleteConfirmationTextForMedia(photo, appText)}
      toastText={`"${titleForMedia(photo)}" deleted`}
    />
  );
}
