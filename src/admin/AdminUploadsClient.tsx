'use client';

import {
  getFileNamePartsFromStorageUrl,
} from '@/platforms/storage';
import AdminBatchUploadActions from './AdminBatchUploadActions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tags } from '@/tag';
import AdminUploadsTable from './AdminUploadsTable';
import { Albums } from '@/album';
import sleep from '@/utility/sleep';
import { useAppState } from '@/app/AppState';
import { UploadState, UrlAddStatus } from './upload';
import {
  isAutoAddProcessingUrl,
} from './upload/auto-add';
import { processUploadToMedia } from './upload/process';

const GENERATED_MEDIA_ID_PATTERN = /^\d{12}$/;
const deriveTitleFromFileName = (fileName?: string) =>
  fileName
    ? fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    : '';

const getDisplayFileName = (url: string, fileName?: string) =>
  getFileNamePartsFromStorageUrl(url).fileName || fileName || '';

const titleForUpload = (
  url: string,
  fallbackFileName?: string,
  metadataByUrl:
    Pick<UploadState, 'uploadMetadataByUrl'>['uploadMetadataByUrl'] = {},
) =>
  metadataByUrl[url]?.title ??
  deriveTitleFromFileName(
    metadataByUrl[url]?.originalFileName ?? fallbackFileName,
  );

const dedupeUploadStatuses = (statuses: UrlAddStatus[]) => {
  const statusRank = {
    adding: 5,
    waiting: 4,
    uploading: 3,
    error: 2,
    added: 1,
  } satisfies Record<NonNullable<UrlAddStatus['status']>, number>;

  const byUrl = new Map<string, UrlAddStatus>();
  for (const status of statuses) {
    const existing = byUrl.get(status.url);
    if (!existing) {
      byUrl.set(status.url, status);
      continue;
    }

    const existingRank = existing.status ? statusRank[existing.status] : 0;
    const statusRankValue = status.status ? statusRank[status.status] : 0;
    byUrl.set(status.url, statusRankValue > existingRank
      ? { ...existing, ...status }
      : { ...status, ...existing });
  }
  return Array.from(byUrl.values());
};

const mergeUploadStatusWithDefaults = (
  upload: UrlAddStatus,
  current?: UrlAddStatus,
): UrlAddStatus => {
  if (!current) { return upload; }

  const storageFallbackTitle = deriveTitleFromFileName(
    getDisplayFileName(upload.url, upload.fileName),
  );
  const shouldReplaceCurrentTitle =
    !current.draftTitle ||
    (
      Boolean(upload.draftTitle) &&
      current.draftTitle === storageFallbackTitle &&
      current.draftTitle !== upload.draftTitle
    ) ||
    (
      Boolean(upload.draftTitle) &&
      GENERATED_MEDIA_ID_PATTERN.test(current.draftTitle)
    );
  const shouldReplaceCurrentOriginalFileName =
    Boolean(upload.originalFileName) &&
    !current.originalFileName;

  return {
    ...current,
    ...upload,
    originalFileName: shouldReplaceCurrentOriginalFileName
      ? upload.originalFileName
      : current.originalFileName,
    draftTitle: shouldReplaceCurrentTitle
      ? upload.draftTitle
      : current.draftTitle,
  };
};

export default function AdminUploadsClient({
  urls,
  uniqueTags,
  uniqueAlbums,
  autoAdd = false,
  hideManualActions = false,
  showPersistedUploads = false,
}: {
  urls: UrlAddStatus[]
  uniqueTags: Tags
  uniqueAlbums: Albums
  autoAdd?: boolean
  hideManualActions?: boolean
  showPersistedUploads?: boolean
}) {
  const { uploadState, setUploadState } = useAppState();
  const { clientUploads } = uploadState;
  const clientUploadsRef = useRef(clientUploads);
  useEffect(() => {
    clientUploadsRef.current = clientUploads;
  }, [clientUploads]);
  const metadataByUrl = useMemo(
    () => uploadState.uploadMetadataByUrl ?? {},
    [uploadState.uploadMetadataByUrl],
  );
  const urlsWithDefaults = useMemo(() => urls.map(item => ({
    ...item,
    fileName: getDisplayFileName(item.url, item.fileName),
    originalFileName: metadataByUrl[item.url]?.originalFileName,
    draftTitle: titleForUpload(
      item.url,
      getDisplayFileName(item.url, item.fileName),
      metadataByUrl,
    ),
  })), [metadataByUrl, urls]);
  const urlsWithDefaultsSignature = useMemo(
    () => urlsWithDefaults.map(({
      url,
      status,
      statusMessage,
      draftTitle,
      originalFileName,
      uploadedAt,
    }) => [
      url,
      status ?? '',
      statusMessage ?? '',
      draftTitle ?? '',
      originalFileName ?? '',
      uploadedAt?.toISOString() ?? '',
    ].join('|')).join('||'),
    [urlsWithDefaults],
  );

  const [urlAddStatuses, setUrlAddStatuses] =
    useState<UrlAddStatus[]>(urlsWithDefaults);
  const urlAddStatusesRef = useRef<UrlAddStatus[]>(urlsWithDefaults);
  useEffect(() => {
    urlAddStatusesRef.current = urlAddStatuses;
  }, [urlAddStatuses]);

  const clientUploadStatuses = useMemo<UrlAddStatus[]>(
    () => clientUploads.map(upload => ({
      clientUploadId: upload.id,
      url: upload.uploadedUrl ?? upload.previewUrl,
      fileName: upload.fileName,
      originalFileName: upload.fileName,
      status: upload.status === 'uploading'
        ? 'uploading'
        : upload.status === 'queued' || upload.status === 'processing'
          ? 'waiting'
          : upload.status === 'finished'
            ? 'added'
          : 'error',
      statusMessage: upload.statusMessage ??
        (upload.status === 'uploading'
          ? 'Uploading'
          : upload.status === 'queued'
            ? 'Queued'
          : upload.status === 'finished'
            ? 'Finished'
          : upload.status === 'processing'
            ? 'Detected'
            : 'Upload failed'),
      draftTitle: titleForUpload(
        upload.uploadedUrl ?? upload.previewUrl,
        upload.fileName,
        metadataByUrl,
      ),
      progress: upload.progress,
      isClientUpload: true,
    })),
    [clientUploads, metadataByUrl],
  );
  const clientUploadsById = useMemo(
    () => new Map(clientUploads.map(upload => [upload.id, upload])),
    [clientUploads],
  );
  const activeUploadedUrls = useMemo(
    () => new Set(
      clientUploads
        .filter(upload =>
          upload.status !== 'finished' &&
          Boolean(upload.uploadedUrl),
        )
        .map(upload => upload.uploadedUrl as string),
    ),
    [clientUploads],
  );
  const visibleUploadStatuses = useMemo(
    () => {
      const byKey = new Map<string, UrlAddStatus>();
      const statusRank = {
        adding: 6,
        uploading: 5,
        waiting: 4,
        error: 3,
        added: 2,
      } satisfies Record<NonNullable<UrlAddStatus['status']>, number>;
      const uploadedUrlByClientId = new Map(
        clientUploads
          .filter(upload => upload.uploadedUrl)
          .map(upload => [upload.id, upload.uploadedUrl as string]),
      );
      const keyForStatus = (status: UrlAddStatus) =>
        status.clientUploadId
          ? uploadedUrlByClientId.get(status.clientUploadId) ?? status.url
          : status.url;

      for (const status of [
        ...clientUploadStatuses,
        ...urlAddStatuses,
      ]) {
        const key = keyForStatus(status);
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, status);
          continue;
        }
        const existingRank = existing.status ? statusRank[existing.status] : 0;
        const statusRankValue = status.status ? statusRank[status.status] : 0;
        const shouldPreferStatus =
          status.status === 'error' ||
          (status.isClientUpload && existing.status !== 'error') ||
          statusRankValue > existingRank ||
          (
            statusRankValue === existingRank &&
            !existing.isClientUpload
          );
        byKey.set(key, shouldPreferStatus
          ? { ...existing, ...status }
          : { ...status, ...existing });
      }

      return Array.from(byKey.values()).filter(status => {
        if (!status.isClientUpload) {
          return showPersistedUploads &&
            !activeUploadedUrls.has(status.url);
        }
        const clientUpload = status.clientUploadId
          ? clientUploadsById.get(status.clientUploadId)
          : undefined;
        if (!clientUpload) {
          return status.status === 'error';
        }
        return clientUpload.status !== 'finished';
      });
    },
    [
      clientUploadStatuses,
      clientUploads,
      clientUploadsById,
      activeUploadedUrls,
      showPersistedUploads,
      urlAddStatuses,
    ],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setUrlAddStatuses(current => {
        const storageUrlSet = new Set(urlsWithDefaults.map(({ url }) => url));
        const mergedStorageUploads = urlsWithDefaults.map(upload =>
          mergeUploadStatusWithDefaults(
            upload,
            current.find(({ url }) => url === upload.url),
          ));
        const clientOnlyUploads = current.filter(({ url, status }) =>
          !storageUrlSet.has(url) &&
          (status === 'waiting' || status === 'adding' || status === 'error'));
        return dedupeUploadStatuses([
          ...clientOnlyUploads,
          ...mergedStorageUploads,
        ]);
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [urlsWithDefaultsSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadUrls = useMemo(() => urlAddStatuses
    .map(({ url }) => url), [urlAddStatuses]);
  const uploadTitles = useMemo(() => urlAddStatuses
    .map(({ draftTitle }) => draftTitle ?? ''), [urlAddStatuses]);
  const uploadOriginalFileNames = useMemo(() => urlAddStatuses
    .map(({ originalFileName, fileName }) => originalFileName || fileName || undefined),
  [urlAddStatuses]);

  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const autoAddStatusText = useMemo(() => {
    if (!autoAdd || urlAddStatuses.length === 0) { return undefined; }
    const errorCount = urlAddStatuses.filter(({ status }) => status === 'error')
      .length;
    return errorCount > 0 ? `${errorCount} failed` : undefined;
  }, [autoAdd, urlAddStatuses]);
  useEffect(() => {
    if (!autoAdd || isAdding || uploadUrls.length === 0) { return; }

    const metadataByUrl = uploadState.uploadMetadataByUrl ?? {};
    let cancelled = false;

    const runAutoAdd = async () => {
      const upload = urlAddStatusesRef.current.find(({ status }) =>
        status !== 'adding' &&
        status !== 'added' &&
        status !== 'error');
      if (!upload) { return; }
      const uploadTitle = titleForUpload(
        upload.url,
        upload.fileName,
        metadataByUrl,
      );
      const uploadOriginalFileName =
        metadataByUrl[upload.url]?.originalFileName ??
        upload.originalFileName ??
        upload.fileName;

      setIsAdding(true);
      setUrlAddStatuses(current => current.map(status =>
        status.url === upload.url
          ? {
            ...status,
            status: 'adding',
            statusMessage: 'Registering',
            draftTitle: uploadTitle,
            fileName: uploadOriginalFileName,
          }
          : status,
      ));

      const result = await processUploadToMedia({
        url: upload.url,
        title: uploadTitle,
        originalFileName: uploadOriginalFileName,
        metadata: metadataByUrl[upload.url],
        isCancelled: () => cancelled,
        onUpdate: data => {
          if (cancelled) { return; }
          setUrlAddStatuses(current => current.map(status =>
            status.url === upload.url
              ? {
                ...status,
                draftTitle: uploadTitle,
                fileName: uploadOriginalFileName,
                status: data.status,
                statusMessage: data.statusMessage,
                progress: data.progress,
              }
              : status,
          ));
        },
      });

      if (cancelled) { return; }
      if (result.status === 'error') {
        setIsAdding(false);
        setUrlAddStatuses(current => current.map(status =>
          status.url === upload.url
            ? {
              ...status,
              draftTitle: uploadTitle,
              fileName: uploadOriginalFileName,
              status: 'error',
              statusMessage: result.statusMessage,
              progress: 1,
            }
            : {
              ...status,
              status: status.status === 'adding' ? 'waiting' : status.status,
            }
        ));
        return;
      }

      setUrlAddStatuses(current => current.map(status =>
        status.url === upload.url
          ? {
            ...status,
            draftTitle: uploadTitle,
            fileName: uploadOriginalFileName,
            status: 'added',
            statusMessage: result.statusMessage,
            progress: 1,
          }
          : status,
      ));
      await sleep(250);
      setIsAdding(false);
      const remainingStatuses = urlAddStatusesRef.current
        .filter(({ url }) => url !== upload.url);
      urlAddStatusesRef.current = remainingStatuses;
      setUrlAddStatuses(remainingStatuses);
      if (setUploadState) {
        setUploadState(uploadState => {
          const currentMetadata = uploadState.uploadMetadataByUrl ?? {};
          const remainingMetadata = { ...currentMetadata };
          delete remainingMetadata[upload.url];
          const remainingClientUploads = uploadState.clientUploads.filter(
            clientUpload => clientUpload.uploadedUrl !== upload.url,
          );
          return {
            clientUploads: remainingClientUploads,
            uploadMetadataByUrl: remainingMetadata,
            isUploading: remainingClientUploads.some(clientUpload =>
              clientUpload.status === 'queued' ||
              clientUpload.status === 'uploading' ||
              clientUpload.status === 'processing'),
          };
        });
      }
    };

    void runAutoAdd();

    return () => {
      cancelled = true;
    };
  }, [
    autoAdd,
    isAdding,
    setUploadState,
    uploadState.uploadMetadataByUrl,
    uploadUrls,
  ]);

  useEffect(() => {
    if (!autoAdd) { return; }
    const timeout = window.setTimeout(() => {
      setUrlAddStatuses(current => current.map(status =>
        isAutoAddProcessingUrl(status.url) &&
        status.status !== 'added' &&
        status.status !== 'error'
          ? {
            ...status,
            status: status.status ?? 'waiting',
            statusMessage: status.statusMessage ?? 'Processing',
          }
          : status));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [autoAdd, urlsWithDefaultsSignature]);

  return (
    <div className="space-y-4">
      {autoAddStatusText &&
        <div className="text-sm text-dim">
          {autoAddStatusText}
        </div>}
      {!autoAdd && !hideManualActions && (urls.length > 1 || isAdding) &&
      <AdminBatchUploadActions {...{
        uploadUrls,
        uploadTitles,
        uploadOriginalFileNames,
        uniqueAlbums,
        uniqueTags,
        isAdding,
        setIsAdding,
        setUrlAddStatuses,
        isDeleting,
        setIsDeleting,
      }} />}
      {visibleUploadStatuses.length > 0
        ? <AdminUploadsTable {...{
          hideManualActions,
          isAdding,
          urlAddStatuses: visibleUploadStatuses,
          setUrlAddStatuses,
          isDeleting,
          setIsDeleting,
        }} />
        : <div className="text-sm text-dim">
          No uploads waiting.
        </div>}
    </div>
  );
}
