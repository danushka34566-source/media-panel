'use client';

import { useRouter } from 'next/navigation';
import type { Media } from '@/media';
import MediaSyncButton from './MediaSyncButton';

export default function AdminProcessingSyncButton({
  photo,
}: {
  photo: Media
}) {
  const router = useRouter();

  return (
    <MediaSyncButton
      photo={photo}
      hasAiTextGeneration={false}
      shouldConfirm
      shouldToast
      onSyncComplete={() => router.refresh()}
    />
  );
}
