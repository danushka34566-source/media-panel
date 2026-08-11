import LoaderButton from '@/components/primitives/LoaderButton';
import { addUploadAction } from '@/media/actions';
import {
  generateLocalNaivePostgresString,
  generateLocalPostgresString,
} from '@/utility/date';
import { PATH_ADMIN_MEDIA } from '@/app/path';
import { useRouter } from 'next/navigation';
import { ComponentProps, useState } from 'react';
import IconAddUpload from '@/components/icons/IconAddUpload';

export default function AddUploadButton({
  url,
  title,
  originalFileName,
  overwriteMediaId,
  overwriteTargetUrls,
  preferredFileNameBase,
  onAddStart,
  onAddFinish,
  shouldRedirectToAdminMedia,
  ...props
}: {
  url: string
  title?: string
  originalFileName?: string
  overwriteMediaId?: string
  overwriteTargetUrls?: {
    url: string
    posterUrl?: string
    previewUrl?: string
  }
  preferredFileNameBase?: string
  onAddStart?: () => void
  onAddFinish?: (success: boolean) => void
  shouldRedirectToAdminMedia: boolean
} & ComponentProps<typeof LoaderButton>) {
  const router = useRouter();

  const [isAddingLocal, setIsAddingLocal] = useState(false);

  return (
    <LoaderButton
      {...props}
      icon={<IconAddUpload />}
      onClick={() => {
        onAddStart?.();
        setIsAddingLocal(true);
        addUploadAction({
          url,
          title,
          originalFileName,
          overwriteMediaId,
          overwriteTargetUrls,
          preferredFileNameBase,
          takenAtLocal: generateLocalPostgresString(),
          takenAtNaiveLocal: generateLocalNaivePostgresString(),
        })
          .then(() => {
            if (shouldRedirectToAdminMedia) {
              router.push(PATH_ADMIN_MEDIA);
            } else {
              onAddFinish?.(true);
              setIsAddingLocal(false);
            }
          })
          .catch(() => {
            onAddFinish?.(false);
            setIsAddingLocal(false);
          });
      }}
      isLoading={isAddingLocal}
      tooltip="Add directly"
      hideText="never"
    >
      Add
    </LoaderButton>
  );
}
