'use client';

import { useAppState } from '@/app/AppState';
import MediaUploadWithStatus from './MediaUploadWithStatus';

export default function GlobalMediaUpload({
  shouldResize,
  onLastUpload,
}: {
  shouldResize: boolean
  onLastUpload: () => Promise<void>
}) {
  const { uploadInputRef } = useAppState();

  return (
    <MediaUploadWithStatus
      className="hidden"
      inputId="global-media-upload"
      inputRef={uploadInputRef}
      shouldResize={shouldResize}
      onLastUpload={onLastUpload}
      showButton={false}
      showStatusText={false}
    />
  );
}
