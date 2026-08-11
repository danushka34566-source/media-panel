import type { StorageListItem } from '@/platforms/storage';

export type UploadMetadata = {
  title?: string
  originalFileName?: string
  overwriteMediaId?: string
  overwriteTargetUrls?: {
    url: string
    posterUrl?: string
    previewUrl?: string
  }
  preferredFileNameBase?: string
};

export type ClientUploadStatus =
  'queued' |
  'uploading' |
  'finished' |
  'processing' |
  'error';

export type UploadDisplayStatus =
  'uploading' |
  'waiting' |
  'adding' |
  'added' |
  'error';

export type UrlAddStatus = StorageListItem & {
  clientUploadId?: string
  originalFileName?: string
  status?: UploadDisplayStatus
  statusMessage?: string
  draftTitle?: string
  progress?: number
  isClientUpload?: boolean
  mediaId?: string
};

export type ClientUploadItem = {
  id: string
  fileName: string
  previewUrl: string
  createdAt: number
  updatedAt?: number
  uploadedUrl?: string
  progress: number
  status: ClientUploadStatus
  statusMessage?: string
  retryCount?: number
};

export const WORKER_QUEUE_STATUS_MESSAGES = [
  'Queued for worker scan',
] as const;
export const DEFERRED_UPLOAD_STATUS_MESSAGES = [
  'Waiting for database recovery',
] as const;

export const WORKER_QUEUE_GRACE_MS = 3 * 60 * 1000;
export const WORKER_QUEUE_PRUNE_MS = 10 * 60 * 1000;

const workerQueueStatusMessageSet = new Set<string>(WORKER_QUEUE_STATUS_MESSAGES);
const deferredUploadStatusMessageSet =
  new Set<string>(DEFERRED_UPLOAD_STATUS_MESSAGES);

export const isWorkerQueuedUploadStatusMessage = (statusMessage?: string) =>
  Boolean(statusMessage && workerQueueStatusMessageSet.has(statusMessage.trim()));

const isDeferredUploadStatusMessage = (statusMessage?: string) =>
  Boolean(
    statusMessage &&
    deferredUploadStatusMessageSet.has(statusMessage.trim()),
  );

export const isWorkerQueuedClientUpload = (
  upload: Pick<ClientUploadItem, 'status' | 'uploadedUrl' | 'statusMessage'>,
) =>
  upload.status === 'finished' &&
  Boolean(upload.uploadedUrl) &&
  isWorkerQueuedUploadStatusMessage(upload.statusMessage);

const uploadTimestamp = (
  upload: Pick<ClientUploadItem, 'createdAt' | 'updatedAt'>,
) => upload.updatedAt ?? upload.createdAt;

export const isRecentWorkerQueuedClientUpload = (
  upload: Pick<
    ClientUploadItem,
    'status' | 'uploadedUrl' | 'statusMessage' | 'createdAt' | 'updatedAt'
  >,
  now = Date.now(),
) =>
  isWorkerQueuedClientUpload(upload) &&
  now - uploadTimestamp(upload) < WORKER_QUEUE_GRACE_MS;

export const shouldPruneWorkerQueuedClientUpload = (
  upload: Pick<
    ClientUploadItem,
    'status' | 'uploadedUrl' | 'statusMessage' | 'createdAt' | 'updatedAt'
  >,
  now = Date.now(),
) =>
  (
    isWorkerQueuedClientUpload(upload) ||
    (
      upload.status === 'finished' &&
      Boolean(upload.uploadedUrl) &&
      isDeferredUploadStatusMessage(upload.statusMessage)
    )
  ) &&
  now - uploadTimestamp(upload) >= WORKER_QUEUE_PRUNE_MS;

export interface UploadState {
  isUploading: boolean
  uploadError: string
  debugDownload?: { href: string, fileName: string }
  hideUploadPanel?: boolean
  fileUploadName: string
  fileUploadIndex: number
  filesLength: number
  clientUploads: ClientUploadItem[]
  uploadMetadataByUrl: Record<string, UploadMetadata | undefined>
}

export const INITIAL_UPLOAD_STATE: UploadState = {
  isUploading: false,
  uploadError: '',
  hideUploadPanel: false,
  fileUploadName: '',
  fileUploadIndex: 0,
  filesLength: 0,
  clientUploads: [],
  uploadMetadataByUrl: {},
};
