import {
  CURRENT_STORAGE,
  HAS_CLOUDFLARE_R2_STORAGE,
} from '@/app/config';
import { generateMediaNanoid, generateNanoid } from '@/utility/nanoid';
import {
  CLOUDFLARE_R2_BASE_URL_PRIVATE,
  CLOUDFLARE_R2_BASE_URL_PUBLIC,
  cloudflareR2Copy,
  cloudflareR2Delete,
  cloudflareR2List,
  cloudflareR2ObjectExists,
  cloudflareR2Put,
  isUrlFromCloudflareR2,
} from './cloudflare-r2';
import {
  DRIVE_STORAGE_OBJECT_BASE_URL,
  driveCopy,
  driveDelete,
  driveList,
  driveMove,
  drivePut,
  driveUploadFromClient,
  driveKeyFromUrl,
  driveObjectExists,
  isUrlFromDrive,
  isDriveStorageConfigured,
} from './drive-gateway';
import { PATH_API_PRESIGNED_URL } from '@/app/path';
import type { OnUploadProgressCallback } from './types';

const CLIENT_UPLOAD_STALL_TIMEOUT_MS = 30 * 1000;
const CLIENT_UPLOAD_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

const createTimeoutSignal = (
  timeoutMs: number,
  message: string,
  abortSignal?: AbortSignal,
) => {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    abortSignal?.removeEventListener('abort', abortFromParent);
  };
  const abortFromParent = () => {
    controller.abort(abortSignal?.reason);
    cleanup();
  };

  timeout = setTimeout(() => {
    controller.abort(new DOMException(message, 'TimeoutError'));
    cleanup();
  }, timeoutMs);
  abortSignal?.addEventListener('abort', abortFromParent, { once: true });
  if (abortSignal?.aborted) {
    abortFromParent();
  }

  return {
    signal: controller.signal,
    cleanup,
  };
};

export type StorageListItem = {
  url: string
  fileName: string
  uploadedAt?: Date
  size?: string
};

export type StorageListResponse = StorageListItem[];

export type StorageType = 'cloudflare-r2' | 'drive';

export const generateStorageId = () => generateNanoid(16);

export const generateMediaStorageId = () => generateMediaNanoid();

export const generateFileNameWithId = (prefix: string) =>
  `${prefix}-${generateStorageId()}`;

export const getFileNamePartsFromStorageUrl = (url: string) => {
  const [urlWithoutQuery] = url.split('?');
  const lastSlashIndex = urlWithoutQuery.lastIndexOf('/');
  const urlBase = lastSlashIndex >= 0
    ? urlWithoutQuery.slice(0, lastSlashIndex)
    : '';
  const fileName = lastSlashIndex >= 0
    ? urlWithoutQuery.slice(lastSlashIndex + 1)
    : urlWithoutQuery;
  const lastDotIndex = fileName.lastIndexOf('.');
  const fileNameBase = lastDotIndex >= 0
    ? fileName.slice(0, lastDotIndex)
    : fileName;
  const fileExtension = lastDotIndex >= 0
    ? fileName.slice(lastDotIndex + 1)
    : '';
  const fileId = fileNameBase.split('-').pop() ?? '';
  return {
    urlBase,
    fileName,
    fileNameBase,
    fileId,
    fileExtension,
  };
};

export const sanitizeStorageFileNameBase = (
  base?: string,
  fallback?: string,
  { preserveCase = false }: { preserveCase?: boolean } = {},
) => {
  if (!base) { return fallback ?? 'media'; }
  const normalized = base
    .normalize('NFKD')
    // Allow '@' to preserve handles like `@nadithpro`
    .replace(/[^a-zA-Z0-9._@-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/_+/g, '_')
    .replace(/^-+|[-.]+$/g, '');
  const cased = preserveCase ? normalized : normalized.toLowerCase();
  const trimmed = cased.slice(0, 120);
  return trimmed.length > 0 ? trimmed : (fallback ?? 'media');
};

export const labelForStorage = (type: StorageType): string => {
  switch (type) {
    case 'cloudflare-r2': return 'Cloudflare R2';
    case 'drive': return 'Drive';
  }
};

export const baseUrlForStorage = (type: StorageType) => {
  switch (type) {
    case 'cloudflare-r2': return CLOUDFLARE_R2_BASE_URL_PUBLIC;
    case 'drive': return DRIVE_STORAGE_OBJECT_BASE_URL;
  }
};

const listStorageForType = (
  type: StorageType,
  prefix: string,
  limit?: number,
  suppressErrors = true,
) => {
  let list: Promise<StorageListResponse>;
  switch (type) {
    case 'cloudflare-r2':
      list = HAS_CLOUDFLARE_R2_STORAGE
        ? cloudflareR2List(prefix)
        : Promise.resolve([]);
      break;
    case 'drive':
      list = isDriveStorageConfigured()
        ? driveList(prefix, limit)
        : Promise.resolve([]);
      break;
  }
  return suppressErrors ? list.catch(() => []) : list;
};

export const storageTypeFromUrl = (url: string): StorageType => {
  if (isUrlFromCloudflareR2(url)) {
    return 'cloudflare-r2';
  } else if (isUrlFromDrive(url)) {
    return 'drive';
  }
  throw new Error('Unsupported storage URL');
};

export const uploadFromClientViaPresignedUrl = async (
  file: File | Blob,
  fileNameBase: string,
  extension: string,
  addRandomSuffix?: boolean,
  onUploadProgress?: OnUploadProgressCallback,
  abortSignal?: AbortSignal,
) => {
  const key = addRandomSuffix
    ? `${fileNameBase}-${generateStorageId()}.${extension}`
    : `${fileNameBase}.${extension}`;

  const presignTimeout = createTimeoutSignal(
    CLIENT_UPLOAD_REQUEST_TIMEOUT_MS,
    'Timed out creating upload URL. Retry the upload.',
    abortSignal,
  );
  const presignResponse = await fetch(
    `${PATH_API_PRESIGNED_URL}/${encodeURIComponent(key)}`,
    { signal: presignTimeout.signal },
  ).finally(presignTimeout.cleanup);
  if (!presignResponse.ok) {
    let errorMessage = 'Unable to create presigned upload URL.';
    try {
      const data = await presignResponse.clone().json() as { error?: string };
      if (data?.error) errorMessage = data.error;
    } catch {
      const text = await presignResponse.text();
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }
  const url = (await presignResponse.text()).trim();

  const totalUploadBytes = typeof file.size === 'number' ? file.size : 0;
  const uploadResponse = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: number | undefined;
    const clearStallTimer = () => {
      if (stallTimer) {
        window.clearTimeout(stallTimer);
        stallTimer = undefined;
      }
    };
    const rejectOnce = (error: Error | DOMException) => {
      if (settled) { return; }
      settled = true;
      clearStallTimer();
      reject(error);
    };
    const resolveOnce = (response: Response) => {
      if (settled) { return; }
      settled = true;
      clearStallTimer();
      resolve(response);
    };
    const resetStallTimer = () => {
      clearStallTimer();
      stallTimer = window.setTimeout(() => {
        rejectOnce(new Error(
          'Upload stalled before storage returned a response. Retry the upload.',
        ));
        xhr.abort();
      }, CLIENT_UPLOAD_STALL_TIMEOUT_MS);
    };

    xhr.open('PUT', url);
    // Large uploads may legitimately run for longer than ten minutes. The
    // progress-based stall timer above is the correct failure detector.
    xhr.timeout = 0;
    xhr.responseType = 'text';
    resetStallTimer();
    xhr.upload.onprogress = event => {
      resetStallTimer();
      const totalBytes = event.lengthComputable
        ? event.total
        : totalUploadBytes;
      const loadedBytes = Math.min(totalBytes || event.loaded, event.loaded);
      onUploadProgress?.({
        loaded: loadedBytes,
        total: totalBytes,
        percentage: totalBytes > 0 ? loadedBytes / totalBytes : 0,
      });
    };
    xhr.onload = () => {
      resolveOnce(new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
      }));
    };
    xhr.onerror = () => {
      rejectOnce(new Error(
        'Upload failed before storage returned a response. ' +
        'Check bucket CORS, network stability, and upload URL expiry.',
      ));
    };
    xhr.ontimeout = () => {
      rejectOnce(new Error(
        'Upload timed out before storage returned a response. Retry the upload.',
      ));
    };
    xhr.onabort = () => {
      rejectOnce(new DOMException('The upload was canceled.', 'AbortError'));
    };
    abortSignal?.addEventListener('abort', () => xhr.abort(), { once: true });
    if (abortSignal?.aborted) {
      xhr.abort();
      return;
    }
    xhr.send(file);
  });
  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    throw new Error(errorBody || 'Upload failed. Check storage credentials or CORS configuration.');
  }

  return `${baseUrlForStorage(CURRENT_STORAGE)}/${key}`;
};

export const uploadFileFromClient = async (
  file: File | Blob,
  fileNameBase: string,
  extension: string,
  options?: {
    addRandomSuffix?: boolean
    abortSignal?: AbortSignal
    onUploadProgress?: OnUploadProgressCallback
  },
) => {
  return CURRENT_STORAGE === 'drive'
    ? driveUploadFromClient(
    file,
    `${fileNameBase}${options?.addRandomSuffix === false ? '' : `-${generateStorageId()}`}.${extension}`,
    options?.onUploadProgress,
    options?.abortSignal,
  )
    : uploadFromClientViaPresignedUrl(
    file,
    fileNameBase,
    extension,
    options?.addRandomSuffix ?? true,
    options?.onUploadProgress,
    options?.abortSignal,
  );
};

export const putFile = (
  file: Buffer,
  fileName: string,
) => {
  switch (CURRENT_STORAGE) {
    case 'cloudflare-r2':
      return cloudflareR2Put(file, fileName);
    case 'drive':
      return drivePut(file, fileName);
  }
};

export const copyFile = (
  originUrl: string,
  destinationFileName: string,
): Promise<string> => {
  const { fileName } = getFileNamePartsFromStorageUrl(originUrl);
  switch (storageTypeFromUrl(originUrl)) {
    case 'cloudflare-r2':
      return cloudflareR2Copy(
        fileName,
        destinationFileName,
        false,
      );
    case 'drive':
      return driveCopy(originUrl, destinationFileName);
  }
};

export const deleteFile = (url: string) => {
  const { fileName } = getFileNamePartsFromStorageUrl(url);
  switch (storageTypeFromUrl(url)) {
    case 'cloudflare-r2':
      return cloudflareR2Delete(fileName);
    case 'drive':
      return driveDelete(url);
  }
};

export const deleteFilesWithPrefix = async (prefix: string) => {
  const urls = await getCurrentStorageUrlsForPrefix(prefix);
  return Promise.all(urls.map(({ url }) => deleteFile(url)));
};

const getExistingStorageUrlForFileName = async (
  storageType: StorageType,
  destinationFileName: string,
) => {
  const { fileNameBase } = getFileNamePartsFromStorageUrl(destinationFileName);
  const existing = await getStorageUrlsForPrefix(fileNameBase).catch(() => []);
  const target = existing.find(item =>
    item.fileName.toLowerCase() === destinationFileName.toLowerCase() &&
    storageTypeFromUrl(item.url) === storageType,
  );
  return target?.url;
};

const copyFileViaDownload = async (
  originUrl: string,
  destinationFileName: string,
) => {
  const response = await fetch(originUrl);
  if (!response.ok) {
    throw new Error(`Failed to download storage object (${response.status})`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return putFile(bytes, destinationFileName);
};

export const moveFile = async (
  originUrl: string,
  destinationFileName: string,
) => {
  const storageType = storageTypeFromUrl(originUrl);
  if (storageType === 'drive') {
    try {
      return await driveMove(originUrl, destinationFileName);
    } catch (error: any) {
      const existingUrl = await getExistingStorageUrlForFileName(
        storageType,
        destinationFileName,
      );
      if (existingUrl) {
        return existingUrl;
      }
      // Drive move can timeout on large objects; fall back to copy+delete.
      const copiedUrl = await driveCopy(originUrl, destinationFileName);
      await driveDelete(originUrl).catch(copyDeleteError => {
        console.warn(
          `Drive source cleanup failed for ${originUrl}: ` +
          `${copyDeleteError?.message ?? copyDeleteError}`,
        );
      });
      return copiedUrl;
    }
  }
  let url: string;
  try {
    url = await copyFile(originUrl, destinationFileName);
  } catch (error: any) {
    const existingUrl = await getExistingStorageUrlForFileName(
      storageType,
      destinationFileName,
    );
    if (existingUrl) {
      url = existingUrl;
    } else {
      url = await copyFileViaDownload(originUrl, destinationFileName);
    }
    console.warn(
      `Storage copy fallback used for ${destinationFileName}: ${error?.message ?? error}`,
    );
  }
  // If successful, delete original file
  if (url) {
    await deleteFile(originUrl).catch(error => {
      console.warn(
        `Storage source cleanup failed for ${originUrl}: ${error?.message ?? error}`,
      );
    });
  }
  return url;
};

export const getStorageUrlsForPrefix = async (prefix = '', limit?: number) => {
  const urls = (await Promise.all([
    listStorageForType('cloudflare-r2', prefix, limit),
    listStorageForType('drive', prefix, limit),
  ])).flat();

  const dedupedByFileName = new Map<string, StorageListItem>();
  for (const item of urls) {
    const key = item.fileName.toLowerCase();
    const existing = dedupedByFileName.get(key);
    if (
      !existing ||
      (!existing.uploadedAt && item.uploadedAt) ||
      (
        existing.uploadedAt &&
        item.uploadedAt &&
        item.uploadedAt.getTime() > existing.uploadedAt.getTime()
      )
    ) {
      dedupedByFileName.set(key, item);
    }
  }

  const deduped = Array.from(dedupedByFileName.values())
    .sort((a, b) => {
      if (!a.uploadedAt) { return 1; }
      if (!b.uploadedAt) { return -1; }
      return b.uploadedAt.getTime() - a.uploadedAt.getTime();
    });
  return typeof limit === 'number' && Number.isFinite(limit)
    ? deduped.slice(0, Math.max(1, Math.floor(limit)))
    : deduped;
};

export const getCurrentStorageUrlsForPrefix = async (prefix = '', limit?: number) => {
  const urls = await listStorageForType(CURRENT_STORAGE, prefix, limit);
  return urls.slice().sort((a, b) => {
    if (!a.uploadedAt) { return 1; }
    if (!b.uploadedAt) { return -1; }
    return b.uploadedAt.getTime() - a.uploadedAt.getTime();
  });
};

export const testStorageConnection = (
  storageType: StorageType = CURRENT_STORAGE,
) => {
  switch (storageType) {
    case 'cloudflare-r2':
      return cloudflareR2List('');
    case 'drive':
      return driveList('', 1);
  }
};

const getStorageKeyFromUrl = (url: string, storageType: StorageType) => {
  if (storageType === 'drive') {
    return driveKeyFromUrl(url);
  }
  const [urlWithoutQuery] = url.split('?');
  const baseUrl = [
    CLOUDFLARE_R2_BASE_URL_PUBLIC,
    CLOUDFLARE_R2_BASE_URL_PRIVATE,
  ].find(base => base && urlWithoutQuery.startsWith(base));
  if (!baseUrl) {
    throw new Error('URL is not from configured Cloudflare R2 storage');
  }
  return urlWithoutQuery
    .slice(baseUrl.length)
    .replace(/^\/+/, '')
    .split('/')
    .map(decodeURIComponent)
    .join('/');
};

export const storageObjectExists = async (url: string) => {
  const storageType = storageTypeFromUrl(url);
  const key = getStorageKeyFromUrl(url, storageType);
  if (!key) { return false; }
  return storageType === 'drive'
    ? driveObjectExists(key)
    : cloudflareR2ObjectExists(key);
};

export const getCurrentStorageUrlsForPrefixStrict = async (
  prefix = '',
  limit?: number,
) => {
  const urls = await listStorageForType(
    CURRENT_STORAGE,
    prefix,
    limit,
    false,
  );
  return urls.slice().sort((a, b) => {
    if (!a.uploadedAt) { return 1; }
    if (!b.uploadedAt) { return -1; }
    return b.uploadedAt.getTime() - a.uploadedAt.getTime();
  });
};



