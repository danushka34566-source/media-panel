'use client';

import MediaUploadWithStatus from '@/media/MediaUploadWithStatus';
import { useAppState } from '@/app/AppState';

export default function AdminUploadPanel({
  shouldResize,
  onLastUpload,
}: {
  shouldResize: boolean
  onLastUpload: () => Promise<void>
}) {
  const {
    uploadInputRef,
  } = useAppState();

  return (
    <MediaUploadWithStatus
      className="hidden"
      inputId="admin-upload-panel"
      inputRef={uploadInputRef}
      shouldResize={shouldResize}
      onLastUpload={onLastUpload}
      showButton={false}
      showStatusText={false}
    />
  );
}
