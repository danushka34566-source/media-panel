import {
  clearAutoAddProcessingUrl,
  markAutoAddProcessingUrl,
} from './auto-add';
import type { UploadMetadata } from '.';

export type UploadProcessingUpdate = {
  url?: string
  status?: 'uploading' | 'waiting' | 'adding' | 'added' | 'error'
  statusMessage?: string
  progress?: number
};

export type UploadProcessingResult = {
  status: 'added' | 'error'
  statusMessage: string
};

export const processUploadToMedia = async ({
  url,
  isCancelled,
  onUpdate,
}: {
  url: string
  title: string
  originalFileName?: string
  metadata?: UploadMetadata
  isCancelled?: () => boolean
  onUpdate?: (update: UploadProcessingUpdate) => void
}): Promise<UploadProcessingResult> => {
  markAutoAddProcessingUrl(url);
  onUpdate?.({
    url,
    status: 'waiting',
    statusMessage: 'Uploaded; awaiting worker scan',
    progress: 1,
  });

  try {
    if (isCancelled?.()) {
      return {
        status: 'error',
        statusMessage: 'Registration canceled',
      };
    }

    // Uploading and registration are intentionally separate. Once storage
    // returns the object URL, the panel is finished; the worker discovers and
    // registers the object from its independent storage scan.
    const statusMessage = 'Uploaded; awaiting worker scan';

    onUpdate?.({
      url,
      status: 'added',
      statusMessage,
      progress: 1,
    });
    return {
      status: 'added',
      statusMessage,
    };
  } finally {
    clearAutoAddProcessingUrl(url);
  }
};
