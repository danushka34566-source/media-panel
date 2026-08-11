import ImageMedium from '@/components/image/ImageMedium';
import ImageSmall from '@/components/image/ImageSmall';
import { UrlAddStatus } from './upload';
import clsx from 'clsx/lite';
import ResponsiveDate from '@/components/ResponsiveDate';
import Spinner from '@/components/Spinner';
import { FaRegCircleCheck } from 'react-icons/fa6';
import { FiRotateCcw } from 'react-icons/fi';
import { IoCloseSharp } from 'react-icons/io5';
import { pathForAdminUploadUrl } from '@/app/path';
import DeleteUploadButton from './DeleteUploadButton';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { isElementEntirelyInViewport } from '@/utility/dom';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import EditButton from './EditButton';
import AddUploadButton from './AddUploadButton';
import { getFileNamePartsFromStorageUrl } from '@/platforms/storage';
import { useAppState } from '@/app/AppState';
import { abortClientUpload, retryClientUpload } from './upload/cancel';

function UploadProgressPercent({
  progress = 0,
  className,
}: {
  progress?: number
  className?: string
}) {
  const [displayProgress, setDisplayProgress] = useState(progress);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDisplayProgress(current => Math.max(current, progress));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [progress]);

  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(displayProgress * 100)),
  );

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center',
        'text-[10px] font-medium tabular-nums text-dim',
        className,
      )}
      aria-label={`Upload ${progressPercent}%`}
    >
      {progressPercent}%
    </span>
  );
}

export default function AdminUploadsTableRow({
  url,
  clientUploadId,
  status,
  statusMessage,
  progress,
  draftTitle = '',
  originalFileName,
  uploadedAt,
  size,
  tabIndex,
  shouldRedirectAfterAction,
  hideManualActions,
  isClientUpload: isClientUploadProp,
  setIsDeleting,
  setUrlAddStatuses,
}: UrlAddStatus & {
  tabIndex: number
  shouldRedirectAfterAction: boolean
  isAdding?: boolean
  isDeleting?: boolean
  isComplete?: boolean
  hideManualActions?: boolean
  setIsDeleting?: Dispatch<SetStateAction<boolean>>
  setUrlAddStatuses?: Dispatch<SetStateAction<UrlAddStatus[]>>
}) {
  const ref = useRef<HTMLDivElement>(null);
  const {
    uploadState: { clientUploads, uploadMetadataByUrl },
    setUploadState,
  } = useAppState();

  const {
    fileExtension,
    fileId,
    fileName,
  } = getFileNamePartsFromStorageUrl(url);

  const derivedOriginalFileName =
    (
      uploadMetadataByUrl?.[url]?.originalFileName ??
      originalFileName ??
      fileName
    ) || undefined;

  const extension = fileExtension?.toUpperCase();

  useEffect(() => {
    if (
      status === 'adding' &&
      !isElementEntirelyInViewport(ref.current)
    ) {
      window.scrollTo({
        top: (ref.current?.offsetTop ?? 0) - 16,
        behavior: 'smooth',
      });
    }
  }, [status]);

  const isError = status === 'error';
  const isRowLoading =
    Boolean(status) && !isError;

  const updateStatus = (updatedStatus: Partial<UrlAddStatus>) => {
    setUrlAddStatuses?.(statuses => statuses.map(status => status.url === url
      ? {
        ...status,
        ...updatedStatus,
      }
      : status));
  };

  const removeRow = () => {
    setUrlAddStatuses?.(statuses => statuses
      .filter(({ url: urlToRemove }) => urlToRemove !== url));
    if (uploadMetadataByUrl && setUploadState) {
      const { [url]: _removed, ...remaining } = uploadMetadataByUrl;
      setUploadState({ uploadMetadataByUrl: remaining });
    }
  };

  const cancelClientUpload = () => {
    abortClientUpload(clientUploadId);
    const upload = clientUploads.find(item =>
      item.id === clientUploadId || item.previewUrl === url);
    if (upload?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(upload.previewUrl);
    }
    const remainingClientUploads = clientUploads.filter(upload =>
      upload.id !== clientUploadId && upload.previewUrl !== url);
    setUploadState?.({
      clientUploads: remainingClientUploads,
      isUploading: remainingClientUploads.some(upload =>
        upload.status === 'queued' ||
        upload.status === 'uploading' ||
        upload.status === 'processing'),
    });
  };
  const retryUpload = () => {
    retryClientUpload(clientUploadId);
  };
  const removeClientUpload = () => {
    abortClientUpload(clientUploadId);
    const upload = clientUploads.find(item =>
      item.id === clientUploadId || item.previewUrl === url);
    if (upload?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(upload.previewUrl);
    }
    setUploadState?.(currentUploadState => {
      const remainingClientUploads = currentUploadState.clientUploads.filter(
        uploadItem =>
          uploadItem.id !== clientUploadId &&
          uploadItem.previewUrl !== url &&
          uploadItem.uploadedUrl !== url,
      );
      const updatedMetadata = {
        ...(currentUploadState.uploadMetadataByUrl ?? {}),
      };
      delete updatedMetadata[url];
      return {
        clientUploads: remainingClientUploads,
        uploadMetadataByUrl: updatedMetadata,
        isUploading: remainingClientUploads.some(uploadItem =>
          uploadItem.status === 'queued' ||
          uploadItem.status === 'uploading' ||
          uploadItem.status === 'processing'),
      };
    });
    setUrlAddStatuses?.(statuses =>
      statuses.filter(statusItem => statusItem.url !== url));
  };
  const retryDetectedUpload = () => {
    updateStatus({
      status: 'waiting',
      statusMessage: 'Detected',
      progress: 0,
    });
    setUploadState?.(currentUploadState => ({
      clientUploads: currentUploadState.clientUploads.map(clientUpload =>
        clientUpload.uploadedUrl === url
          ? {
            ...clientUpload,
            status: 'processing',
            statusMessage: 'Detected',
            progress: 1,
          }
          : clientUpload),
    }));
  };

  const uploadMetadata = uploadMetadataByUrl?.[url];
  const isAutoAddRow = hideManualActions;
  const isClientUpload = Boolean(isClientUploadProp);
  const isProcessing = status === 'adding' || status === 'waiting';
  const clientUploadStatusText = status === 'uploading'
    ? 'Uploading'
    : statusMessage ?? 'Uploading';
  const rowStatusText = isError
    ? statusMessage ?? 'Failed'
    : status === 'added'
    ? statusMessage ?? 'Added'
    : isClientUpload
      ? clientUploadStatusText
      : status === 'adding' || status === 'waiting'
        ? statusMessage ?? 'Processing'
        : 'Processing';
  const shouldShowClientStatusSpinner =
    isClientUpload &&
    !isError &&
    rowStatusText !== 'Queued' &&
    rowStatusText !== 'Added' &&
    rowStatusText !== 'Finished';
  const shouldShowStatusSpinner =
    !isClientUpload && !isError && isProcessing;
  const hasUploadedClientUrl =
    isClientUpload &&
    clientUploads.some(upload =>
      (upload.id === clientUploadId || upload.previewUrl === url) &&
      Boolean(upload.uploadedUrl));
  const clientUpload = clientUploads.find(upload =>
    upload.id === clientUploadId || upload.previewUrl === url);
  const canRetryClientUpload = isClientUpload && isError;
  const canRemoveFailedClientUpload = isClientUpload && isError;
  const canRetryDetectedUpload = isError && hasUploadedClientUrl;
  const canCancelClientUpload =
    isClientUpload &&
    !hasUploadedClientUrl &&
    (
      status === 'uploading' ||
      clientUpload?.status === 'queued'
    );
  const PreviewImage = isAutoAddRow ? ImageSmall : ImageMedium;

  return (
    <div
      ref={ref}
      className={clsx(
        'flex items-center grow min-w-0',
        'transition-opacity',
        isAutoAddRow
          ? 'rounded-[3px]'
          : 'rounded-lg overflow-hidden border-medium bg-extra-dim',
      )}
    >
      <div className={clsx(
        isAutoAddRow ? 'shrink-0' : 'self-stretch w-[40%] sm:w-auto shrink-0',
        'transition-transform',
      )}>
        {isClientUpload
          ? <div
            className={clsx(
              'flex w-[50px] h-[28px] items-center justify-center',
              'rounded-[3px] overflow-hidden border border-gray-900',
              'bg-black text-white',
            )}
            title={fileId}
            aria-label={`${rowStatusText} ${Math.round((progress ?? 0) * 100)}%`}
          >
            {isError
              ? <span className="text-[9px] uppercase text-red-300">
                Error
              </span>
              : <UploadProgressPercent
                progress={progress}
                className="text-white"
              />}
          </div>
          : <PreviewImage
            title={fileId}
            src={url}
            alt={url}
            aspectRatio={16 / 9}
            className={clsx(
              'bg-dim',
              isAutoAddRow
                ? clsx(
                  'w-[50px] h-[28px]',
                  'rounded-[3px] overflow-hidden border-main',
                )
                : clsx(
                  'max-sm:m-2 max-sm:mr-0',
                  'max-sm:outline-medium max-sm:shadow-sm',
                  'max-sm:rounded-sm overflow-hidden',
                ),
            )}
          />}
      </div>
      <div className={clsx(
        'flex w-full min-w-0',
        isAutoAddRow
          ? 'items-center gap-2 sm:gap-3 pl-2 sm:pl-3'
          : 'self-stretch gap-2 sm:gap-3 p-2 sm:p-3',
      )}>
        <div className={clsx(
          'w-full min-w-0',
          isAutoAddRow
            ? 'grid grid-cols-[1fr_auto] items-center gap-2'
            : 'flex flex-col gap-6',
        )}>
          <div className={clsx(
            'min-w-0',
            isAutoAddRow ? 'flex flex-col gap-0.5' : 'flex flex-col grow gap-2',
          )}>
            {isAutoAddRow
              ? <div className="truncate">
                {draftTitle || fileName}
              </div>
              : <FieldsetWithStatus
                id={`title-${url}`}
                label="Title"
                value={draftTitle}
                onChange={titleUpdated =>
                  updateStatus({ draftTitle: titleUpdated })}
                placeholder="Title (optional)"
                tabIndex={tabIndex}
                readOnly={isRowLoading}
                capitalize
                hideLabel
              />}
            {!isClientUpload && <div className="flex items-center gap-2">
              {isRowLoading || hideManualActions || isProcessing
                ? <>
                  {!isAutoAddRow && status === 'added'
                    ? <FaRegCircleCheck size={18} />
                    : undefined}
                </>
                : <>
                  <AddUploadButton
                    url={url}
                    title={draftTitle}
                    originalFileName={derivedOriginalFileName}
                    overwriteMediaId={uploadMetadata?.overwriteMediaId}
                    overwriteTargetUrls={uploadMetadata?.overwriteTargetUrls}
                    preferredFileNameBase={uploadMetadata?.preferredFileNameBase}
                    onAddStart={() => updateStatus({
                      status: 'adding',
                      statusMessage: 'Processing',
                    })}
                    onAddFinish={didSucceed => {
                      if (didSucceed) {
                        removeRow();
                      } else {
                        updateStatus({
                          status: undefined,
                          statusMessage: 'Add failed. Fix issues and retry.',
                        });
                      }
                    }}
                    shouldRedirectToAdminMedia={shouldRedirectAfterAction}
                    disabled={isRowLoading}
                    tooltipSide="bottom"
                  />
                  <EditButton
                    path={pathForAdminUploadUrl(
                      url,
                      draftTitle,
                      derivedOriginalFileName,
                    )}
                    disabled={isRowLoading}
                    tooltip="Review EXIF details before adding"
                    hideText="always"
                    tooltipSide="bottom"
                  />
                  <DeleteUploadButton
                    urls={[url]}
                    shouldRedirectToAdminMedia={shouldRedirectAfterAction}
                    onDeleteStart={() => setIsDeleting?.(true)}
                    onDelete={() => {
                      setIsDeleting?.(false);
                      removeRow();
                    }}
                    disabled={isRowLoading}
                    tooltip="Delete upload"
                    tooltipSide="bottom"
                  />
                </>}
            </div>}
          </div>
          <div className={clsx(
            'flex gap-2 sm:gap-3 min-w-0',
            isAutoAddRow ? 'text-sm text-dim justify-end' : 'ml-0.5',
          )}>
            {isRowLoading || isProcessing || isClientUpload
              ? <span
                className="inline-flex min-w-0 items-center gap-1.5"
                aria-live={isClientUpload ? 'polite' : undefined}
              >
                {shouldShowClientStatusSpinner &&
                  <Spinner
                    size={13}
                    className="shrink-0 translate-y-[0.5px]"
                  />}
                <span className="truncate">
                  {rowStatusText}
                </span>
                {shouldShowStatusSpinner &&
                  <Spinner
                    size={13}
                    className="ml-1.5 translate-y-[0.5px]"
                  />}
                {isAutoAddRow && status === 'added' &&
                  <FaRegCircleCheck
                    size={14}
                    className="shrink-0"
                  />}
                {(canRetryClientUpload ||
                  canCancelClientUpload ||
                  canRemoveFailedClientUpload) &&
                  <span className="ml-2 inline-flex shrink-0 items-center gap-1">
                    {canRetryClientUpload &&
                      <button
                        type="button"
                        className={clsx(
                          'inline-flex size-6 items-center justify-center',
                          'rounded-full border',
                          'border-gray-300 dark:border-gray-700',
                          'text-dim hover:text-main',
                        )}
                        onClick={retryUpload}
                        aria-label="Retry upload"
                        title="Retry upload"
                      >
                        <FiRotateCcw
                          size={13}
                          className="shrink-0"
                        />
                      </button>}
                    {canRemoveFailedClientUpload &&
                      <button
                        type="button"
                        className={clsx(
                          'inline-flex size-6 items-center justify-center',
                          'rounded-full border',
                          'border-gray-300 dark:border-gray-700',
                          'text-dim hover:text-main',
                        )}
                        onClick={removeClientUpload}
                        aria-label="Remove failed upload"
                        title="Remove failed upload"
                      >
                        <IoCloseSharp
                          size={16}
                          className="shrink-0 translate-y-[0.5px]"
                        />
                      </button>}
                    {canCancelClientUpload &&
                      <button
                        type="button"
                        className={clsx(
                          'inline-flex size-6 items-center justify-center',
                          'rounded-full border',
                          'border-gray-300 dark:border-gray-700',
                          'text-dim hover:text-main',
                        )}
                        onClick={cancelClientUpload}
                        aria-label="Cancel upload"
                        title="Cancel upload"
                      >
                        <IoCloseSharp
                          size={16}
                          className="shrink-0 translate-y-[0.5px]"
                        />
                      </button>}
                  </span>}
                {isAutoAddRow && canRetryDetectedUpload &&
                  <span className="ml-2 inline-flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className={clsx(
                        'inline-flex size-6 items-center justify-center',
                        'rounded-full border',
                        'border-gray-300 dark:border-gray-700',
                        'text-dim hover:text-main',
                      )}
                      onClick={retryDetectedUpload}
                      aria-label="Retry registration"
                      title="Retry registration"
                    >
                      <FiRotateCcw
                        size={13}
                        className="shrink-0"
                      />
                    </button>
                  </span>}
              </span>
              : hideManualActions
                ? <span className="truncate">
                  {statusMessage ?? 'Detected'}
                </span>
              : <>
                {uploadedAt
                  ? <ResponsiveDate
                    date={uploadedAt}
                    titleLabel="UPLOADED AT"
                  />
                  : '—'}
                <div className="max-sm:hidden text-dim truncate">
                  {size
                    ? `${size} ${extension}`
                  : extension}
                </div>
              </>}
          </div>
        </div>
      </div>
    </div>
  );
}
