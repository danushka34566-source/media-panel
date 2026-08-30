'use client';

import MediaInput from '../components/MediaInput';
import { clsx } from 'clsx/lite';
import { useAppState } from '@/app/AppState';
import {
  RefObject,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import Spinner from '@/components/Spinner';
import ResponsiveText from '@/components/primitives/ResponsiveText';
import { useAppText } from '@/i18n/state/client';
import { uploadMediaFromClient } from './storage';
import type { ClientUploadItem, UploadMetadata } from '@/admin/upload';
import {
  registerUploadAbortController,
  registerUploadRetryHandler,
  unregisterUploadAbortController,
  unregisterUploadRetryHandler,
} from '@/admin/upload/cancel';
import type { UploadProgressEvent } from '@/platforms/storage/types';
import { createUploadTaskQueue } from '@/admin/upload/concurrency';

const createUploadBatchId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const MAX_CLIENT_UPLOAD_RETRIES = 2;
// Keep several files in flight so a completed file can hand its slot to the
// next queued file immediately. Four is still bounded enough to avoid
// saturating the browser/server with an unbounded fan-out.
const MAX_CONCURRENT_CLIENT_UPLOADS = 4;
const MIN_PROGRESS_UPDATE_INTERVAL_MS = 80;
const RETRYABLE_UPLOAD_ERROR_PATTERNS = [
  /timed out/i,
  /stalled/i,
  /network/i,
  /upload failed before storage returned/i,
  /unable to create presigned upload url/i,
  /unable to generate upload url/i,
  /drive.*(?:upload|multipart).*(?:failed|5\d\d)/i,
];

const ACTIVE_CLIENT_UPLOAD_STATUSES = new Set<ClientUploadItem['status']>([
  'queued',
  'uploading',
  'processing',
]);

const isRetryableUploadError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }
  const message = error instanceof Error
    ? error.message
    : String(error ?? '');
  return RETRYABLE_UPLOAD_ERROR_PATTERNS.some(pattern => pattern.test(message));
};

const hasActiveClientUploads = (uploads: ClientUploadItem[]) =>
  uploads.some(upload => ACTIVE_CLIENT_UPLOAD_STATUSES.has(upload.status));

export default function MediaUploadWithStatus({
  inputRef,
  inputId,
  shouldResize,
  onLastUpload,
  showStatusText = true,
  showButton = true,
  className,
  debug,
}: {
  inputRef?: RefObject<HTMLInputElement | null>
  inputId: string
  shouldResize: boolean
  onLastUpload?: () => Promise<void>
  showStatusText?: boolean
  showButton?: boolean
  className?: string
  debug?: boolean
}) {
  const {
    uploadState: {
      isUploading,
      uploadError,
      fileUploadName,
      fileUploadIndex,
      filesLength,
      debugDownload,
      clientUploads,
    },
    setUploadState,
  } = useAppState();

  const appText = useAppText();
  useEffect(() => {
    // Hide upload panel while button is shown
    if (showButton) {
      setUploadState?.({ hideUploadPanel: true });
      return () => { setUploadState?.({ hideUploadPanel: false }); };
    }
  }, [setUploadState, showButton]);

  const shouldResetUploadStateAfterPending = useRef(false);
  const uploadFinishFallbackTimer = useRef<number | undefined>(undefined);
  const clientUploadsRef = useRef(clientUploads);
  const uploadBatchByUploadIdRef = useRef(new Map<string, string>());
  const uploadBatchStateRef = useRef(new Map<string, {
    pendingUploadIds: Set<string>
    hadSuccessfulUpload: boolean
  }>());
  const uploadTaskQueueRef = useRef(
    createUploadTaskQueue(MAX_CONCURRENT_CLIENT_UPLOADS),
  );
  const lastProgressUpdateAtRef = useRef(new Map<string, number>());

  const enqueueClientUpload = useCallback((task: () => Promise<void>) => {
    void uploadTaskQueueRef.current.enqueue(task).catch(error => {
      console.error('Queued upload failed unexpectedly', error);
    });
  }, []);

  useEffect(() => {
    clientUploadsRef.current = clientUploads;
  }, [clientUploads]);

  const markClientUploadSettled = useCallback((
    clientUploadId: string,
    wasSuccessful: boolean,
  ) => {
    const batchId = uploadBatchByUploadIdRef.current.get(clientUploadId);
    if (!batchId) {
      return;
    }
    lastProgressUpdateAtRef.current.delete(clientUploadId);
    uploadBatchByUploadIdRef.current.delete(clientUploadId);
    const batchState = uploadBatchStateRef.current.get(batchId);
    if (!batchState) {
      return;
    }

    if (wasSuccessful) {
      batchState.hadSuccessfulUpload = true;
    }
    batchState.pendingUploadIds.delete(clientUploadId);

    if (batchState.pendingUploadIds.size > 0) {
      return;
    }

    uploadBatchStateRef.current.delete(batchId);
    if (batchState.hadSuccessfulUpload) {
      void onLastUpload?.().catch(error => {
        console.error('Upload completion callback failed', error);
      });
    }
  }, [onLastUpload]);

  const setClientUploads = useCallback((
    clientUploadsUpdated:
      ClientUploadItem[] |
      ((clientUploads: ClientUploadItem[]) => ClientUploadItem[]),
  ) => {
    setUploadState?.(uploadState => {
      const updatedClientUploads = typeof clientUploadsUpdated === 'function'
        ? clientUploadsUpdated(uploadState.clientUploads)
        : clientUploadsUpdated;
      clientUploadsRef.current = updatedClientUploads;
      return { clientUploads: updatedClientUploads };
    });
  }, [setUploadState]);

  const updateClientUpload = useCallback((
    id: string,
    update: Partial<(typeof clientUploads)[number]>,
  ) => {
    // XHR can emit progress events much faster than React needs to paint.
    // Coalescing only in-progress updates keeps the transfer thread free and
    // prevents a large multi-file selection from rerendering the whole list
    // for every network event. State transitions and final progress remain
    // immediate.
    if (
      typeof update.progress === 'number' &&
      update.status === 'uploading' &&
      update.progress < 0.995
    ) {
      const now = Date.now();
      const last = lastProgressUpdateAtRef.current.get(id) ?? 0;
      if (now - last < MIN_PROGRESS_UPDATE_INTERVAL_MS) {
        return;
      }
      lastProgressUpdateAtRef.current.set(id, now);
    }
    setClientUploads(currentClientUploads =>
      currentClientUploads.map(upload =>
        upload.id === id
          ? {
            ...upload,
            ...update,
            updatedAt: Date.now(),
            ...typeof update.progress === 'number' && {
              progress:
                upload.status === 'uploading' || update.status === 'uploading'
                  ? Math.max(upload.progress, update.progress)
                  : update.progress,
            },
          }
          : upload));
  }, [setClientUploads]);

  const isClientUploadActive = useCallback((id: string) =>
    clientUploadsRef.current.some(upload => upload.id === id),
  []);

  const finalizeClientUploadState = useCallback((
    uploadState: {
      clientUploads: ClientUploadItem[]
      uploadMetadataByUrl?: Record<string, UploadMetadata | undefined>
      uploadError: string
      fileUploadName: string
      fileUploadIndex: number
      filesLength: number
    },
    updatedClientUploads: ClientUploadItem[],
    updatedUploadMetadataByUrl = uploadState.uploadMetadataByUrl ?? {},
  ) => {
    clientUploadsRef.current = updatedClientUploads;
    const hasActiveBrowserUploads = hasActiveClientUploads(updatedClientUploads);
    return {
      clientUploads: updatedClientUploads,
      uploadMetadataByUrl: updatedUploadMetadataByUrl,
      isUploading: hasActiveBrowserUploads,
      uploadError: hasActiveBrowserUploads ? uploadState.uploadError : '',
      fileUploadName: hasActiveBrowserUploads
        ? uploadState.fileUploadName
        : '',
      fileUploadIndex: hasActiveBrowserUploads
        ? uploadState.fileUploadIndex
        : 0,
      filesLength: hasActiveBrowserUploads
        ? uploadState.filesLength
        : 0,
    };
  }, []);

  const resetFinishedUploadState = useCallback(() => {
    setUploadState?.({
      isUploading: false,
      uploadError: '',
      hideUploadPanel: false,
      fileUploadName: '',
      fileUploadIndex: 0,
      filesLength: 0,
      debugDownload: undefined,
    });
    shouldResetUploadStateAfterPending.current = false;
    if (uploadFinishFallbackTimer.current) {
      window.clearTimeout(uploadFinishFallbackTimer.current);
      uploadFinishFallbackTimer.current = undefined;
    }
  }, [setUploadState]);

  // Reset upload state when component unmounts
  // when not reset during route transition
  useEffect(() => {
    const uploadBatchByUploadId = uploadBatchByUploadIdRef.current;
    const uploadBatchState = uploadBatchStateRef.current;
    return () => {
      if (uploadFinishFallbackTimer.current) {
        window.clearTimeout(uploadFinishFallbackTimer.current);
      }
      uploadBatchByUploadId.clear();
      uploadBatchState.clear();
      if (shouldResetUploadStateAfterPending.current) {
        resetFinishedUploadState();
      }
    };
  }, [resetFinishedUploadState]);

  const uploadStatusText = filesLength > 1
    ? appText.utility.paginate(fileUploadIndex + 1, filesLength)
    : undefined;
  const isFinishing = shouldResetUploadStateAfterPending.current;

  return (
    <>
      <div className={clsx(
        'flex items-center gap-4',
        className,
      )}>
        <div className={clsx(
          showButton ? 'flex' : 'hidden',
          'items-center',
        )}>
          <MediaInput
            ref={inputRef}
            id={inputId}
            shouldResize={shouldResize}
            disabled={isFinishing}
            onStart={() => {
              setUploadState?.({
                isUploading: true,
                uploadError: '',
                hideUploadPanel: showButton,
              });
            }}
            onFilesSelected={files => {
              const batchId = createUploadBatchId();
              const uploadIds = files.map(({ id }) => id);
              uploadBatchStateRef.current.set(batchId, {
                pendingUploadIds: new Set(uploadIds),
                hadSuccessfulUpload: false,
              });
              for (const uploadId of uploadIds) {
                uploadBatchByUploadIdRef.current.set(uploadId, batchId);
              }
              setClientUploads(currentClientUploads => [
                ...currentClientUploads,
                ...files.map(({ id, file, previewUrl }) => ({
                  id,
                  fileName: file.name,
                  previewUrl,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  progress: 0,
                  status: 'queued' as const,
                  statusMessage: 'Preparing upload',
                  retryCount: 0,
                })),
              ]);
              setUploadState?.({
                isUploading: true,
                uploadError: '',
                filesLength: files.length,
                hideUploadPanel: showButton,
              });
            }}
            onBlobReady={async ({
              blob,
              clientUploadId,
              extension,
              mediaType,
              originalFileName,
            }) => {
              const resolvedOriginalFileName = originalFileName;
              const resolvedExtension = extension;

              const completeUploadedFile = (url: string) => {
                if (!isClientUploadActive(clientUploadId)) {
                  markClientUploadSettled(clientUploadId, false);
                  return;
                }

                unregisterUploadRetryHandler(clientUploadId);
                markClientUploadSettled(clientUploadId, true);
                setUploadState?.(uploadState => {
                  const updatedClientUploads = uploadState.clientUploads.map(upload =>
                    upload.id === clientUploadId
                      ? {
                        ...upload,
                        uploadedUrl: url,
                        progress: 1,
                        status: 'finished' as const,
                        statusMessage: 'Uploaded; awaiting worker scan',
                        updatedAt: Date.now(),
                      }
                      : upload);
                  return {
                    ...finalizeClientUploadState(
                      uploadState,
                      updatedClientUploads,
                    ),
                    uploadError: '',
                  };
                });
              };

              const runUpload = async () => {
                while (isClientUploadActive(clientUploadId)) {
                  if (!isClientUploadActive(clientUploadId)) {
                    markClientUploadSettled(clientUploadId, false);
                    return;
                  }

                  if (debug) {
                    markClientUploadSettled(clientUploadId, false);
                    setUploadState?.({
                      isUploading: false,
                      uploadError: '',
                      debugDownload: {
                        href: URL.createObjectURL(blob),
                        fileName: `debug.${extension}`,
                      },
                    });
                    return;
                  }

                  setUploadState?.(uploadState => {
                    const uploadIndex = uploadState.clientUploads.findIndex(upload =>
                      upload.id === clientUploadId);
                    return uploadIndex >= 0
                      ? {
                        fileUploadIndex: uploadIndex,
                        fileUploadName: resolvedOriginalFileName,
                      }
                      : {};
                  });
                  updateClientUpload(clientUploadId, {
                    progress: 0.01,
                    status: 'uploading',
                    statusMessage: 'Uploading',
                  });

                  try {
                    const controller = new AbortController();
                    registerUploadAbortController(clientUploadId, controller);
                    const { url } = await uploadMediaFromClient(
                      blob,
                      {
                        extension: resolvedExtension,
                        mediaType,
                        originalFileName: resolvedOriginalFileName,
                        abortSignal: controller.signal,
                        onUploadProgress: ({ percentage }: UploadProgressEvent) => {
                          if (!isClientUploadActive(clientUploadId)) {
                            return;
                          }
                          const normalizedProgress = percentage > 1
                            ? percentage / 100
                            : percentage;
                          const isFinalizingUpload = normalizedProgress >= 0.999;
                          updateClientUpload(clientUploadId, {
                            progress: isFinalizingUpload
                              ? 0.995
                              : normalizedProgress,
                            status: 'uploading',
                            statusMessage: isFinalizingUpload
                              ? 'Finalizing upload'
                              : 'Uploading',
                          });
                        },
                      },
                    );

                    setUploadState?.({
                      fileUploadName: resolvedOriginalFileName,
                    });
                    completeUploadedFile(url);
                    return;
                  } catch (error) {
                    console.error(error);
                    const currentUpload = clientUploadsRef.current.find(upload =>
                      upload.id === clientUploadId);
                    const retryCount = currentUpload?.retryCount ?? 0;
                    if (
                      isRetryableUploadError(error) &&
                    retryCount < MAX_CLIENT_UPLOAD_RETRIES
                    ) {
                      const nextRetryCount = retryCount + 1;
                      updateClientUpload(clientUploadId, {
                        status: 'queued',
                        statusMessage:
                        `Retrying upload (${nextRetryCount}/${MAX_CLIENT_UPLOAD_RETRIES})`,
                        retryCount: nextRetryCount,
                        progress: Math.max(currentUpload?.progress ?? 0, 0.01),
                      });
                      setUploadState?.({
                        isUploading: true,
                        uploadError: '',
                      });
                      await new Promise(resolve => {
                        window.setTimeout(resolve, nextRetryCount * 1200);
                      });
                      continue;
                    }
                    updateClientUpload(clientUploadId, {
                      status: 'error',
                      statusMessage: error instanceof Error ? error.message : String(error),
                      retryCount,
                    });
                    markClientUploadSettled(clientUploadId, false);
                    setUploadState?.(uploadState => ({
                      isUploading: uploadState.clientUploads.some(upload =>
                        upload.id !== clientUploadId &&
                      ACTIVE_CLIENT_UPLOAD_STATUSES.has(upload.status),
                      ),
                      uploadError: error instanceof Error ? error.message : String(error),
                    }));
                    return;
                  } finally {
                    unregisterUploadAbortController(clientUploadId);
                  }
                }
              };
              updateClientUpload(clientUploadId, {
                status: 'queued',
                statusMessage: 'Queued',
              });
              registerUploadRetryHandler(clientUploadId, () => {
                updateClientUpload(clientUploadId, {
                  status: 'queued',
                  statusMessage: 'Queued',
                  retryCount: 0,
                  progress: 0,
                });
                setUploadState?.({
                  isUploading: true,
                  uploadError: '',
                });
                enqueueClientUpload(runUpload);
              });
              enqueueClientUpload(runUpload);
            }}
            showButton={showButton}
            debug={debug}
          />
        </div>
        {showStatusText && <div className={clsx(
          'flex items-center gap-4 overflow-hidden',
        )}>
          {isUploading && !showButton &&
          <Spinner
            className="text-dim translate-y-[1px]"
            color="text"
            size={14}
          />}
          {uploadError
            ? <span className="text-error">
              {uploadError}
            </span>
            : <span className="truncate">
              {isUploading
                ? isFinishing
                  ? <>
                    {appText.utility.finishing}
                  </>
                  : <>
                    {!showButton && uploadStatusText
                      ? <>
                        <ResponsiveText shortText={uploadStatusText}>
                          {appText.utility.uploading} {uploadStatusText}
                        </ResponsiveText>
                        {': '}
                        {fileUploadName}
                      </>
                      : <ResponsiveText shortText={fileUploadName}>
                        {appText.utility.uploading} {fileUploadName}
                      </ResponsiveText>}
                  </>
                : !showButton && <>Initializing</>}
            </span>}
        </div>}
        {debug && debugDownload &&
        <a
          className="block"
          href={debugDownload.href}
          download={debugDownload.fileName}
        >
          Download
        </a>}
      </div>
    </>
  );
};
