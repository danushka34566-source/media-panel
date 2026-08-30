import { formatBytes } from '@/utility/number';
import type { OnUploadProgressCallback } from './types';
import { PATH_API_PRESIGNED_URL, PATH_API_STORAGE_MULTIPART } from '@/app/path';

const DRIVE_LIST_TIMEOUT_MS = 2500;
const DRIVE_UPLOAD_REQUEST_TIMEOUT_MS = 30000;
const DRIVE_MUTATION_TIMEOUT_MS = 30000;
const DRIVE_UPLOAD_STALL_TIMEOUT_MS = 90000;

const parseInteger = (
  value: string | undefined,
  fallback: number,
  { min = 1 }: { min?: number } = {},
) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

const DRIVE_MULTIPART_THRESHOLD_BYTES = parseInteger(
  process.env.NEXT_PUBLIC_DRIVE_MULTIPART_THRESHOLD_BYTES,
  32 * 1024 * 1024,
);
const DRIVE_MULTIPART_PART_SIZE_BYTES = parseInteger(
  process.env.NEXT_PUBLIC_DRIVE_MULTIPART_PART_SIZE_BYTES,
  8 * 1024 * 1024,
);
const DRIVE_MULTIPART_CONCURRENCY = parseInteger(
  process.env.NEXT_PUBLIC_DRIVE_MULTIPART_CONCURRENCY,
  8,
);
const DRIVE_MULTIPART_PART_URL_LOOKAHEAD = parseInteger(
  process.env.NEXT_PUBLIC_DRIVE_MULTIPART_PART_URL_LOOKAHEAD,
  DRIVE_MULTIPART_CONCURRENCY + 1,
);
const DRIVE_MULTIPART_REQUEST_RETRIES = 2;
const DRIVE_MULTIPART_PART_UPLOAD_RETRIES = 2;
const DRIVE_MULTIPART_MAX_PART_URL_LOOKAHEAD =
  DRIVE_MULTIPART_CONCURRENCY + 2;
const DRIVE_UPLOAD_REQUEST_RETRIES = 2;

const DRIVE_BASE_URL = (process.env.DRIVE_STORAGE_BASE_URL || '').replace(/\/+$/, '');
const DRIVE_PROJECT_ID = process.env.NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID || '';
const DRIVE_BUCKET = process.env.NEXT_PUBLIC_DRIVE_STORAGE_BUCKET || '';
const DRIVE_API_KEY = process.env.DRIVE_STORAGE_API_KEY || '';
const DRIVE_OBJECT_BASE_URL = DRIVE_BASE_URL && DRIVE_BUCKET
  ? `${DRIVE_BASE_URL}/${encodeURIComponent(DRIVE_BUCKET)}`
  : '';
const DRIVE_API_BASE_URL = (() => {
  if (!DRIVE_BASE_URL) { return ''; }
  try {
    return new URL(DRIVE_BASE_URL).origin;
  } catch {
    return '';
  }
})();

export const DRIVE_STORAGE_BASE_URL = DRIVE_BASE_URL || undefined;
export const DRIVE_STORAGE_OBJECT_BASE_URL = DRIVE_OBJECT_BASE_URL || undefined;

export const isDriveStorageConfigured = () =>
  Boolean(DRIVE_BASE_URL && DRIVE_API_BASE_URL && DRIVE_OBJECT_BASE_URL && DRIVE_PROJECT_ID && DRIVE_BUCKET && DRIVE_API_KEY);

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Drive request timed out.', 'TimeoutError'));
  }, timeoutMs);
  const parentSignal = init.signal;
  const abortFromParent = () => controller.abort(parentSignal?.reason);

  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  if (parentSignal?.aborted) {
    abortFromParent();
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
};

const readDriveError = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => ({} as { error?: string }));
  return data.error || fallback;
};

const headers = () => ({
  Authorization: `Bearer ${DRIVE_API_KEY}`,
  'X-Drive-Project': DRIVE_PROJECT_ID,
  'X-Drive-Bucket': DRIVE_BUCKET,
});

const objectUrlForKey = (key: string) => `${DRIVE_OBJECT_BASE_URL}/${key.split('/').map(encodeURIComponent).join('/')}`;

type DriveMultipartPart = {
  partNumber: number;
  etag: string;
};

type DriveMultipartPartPlan = {
  partNumber: number;
  start: number;
  end: number;
  size: number;
};

type DriveMultipartBridgeResponse = {
  uploadId?: string;
  url?: string;
  error?: string;
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

export const isUrlFromDrive = (url?: string) =>
  Boolean(DRIVE_STORAGE_OBJECT_BASE_URL && url?.startsWith(DRIVE_STORAGE_OBJECT_BASE_URL));

export const driveKeyFromUrl = (url: string) => {
  const [urlWithoutQuery] = url.split('?');
  if (!DRIVE_OBJECT_BASE_URL || !urlWithoutQuery.startsWith(DRIVE_OBJECT_BASE_URL)) {
    throw new Error(`URL is not from configured Drive storage: ${url}`);
  }
  const relative = urlWithoutQuery.slice(DRIVE_OBJECT_BASE_URL.length).replace(/^\/+/, '');
  return relative.split('/').map(decodeURIComponent).join('/');
};

export const driveCreatePresignedUpload = async (key: string, contentType?: string) => {
  const search = new URLSearchParams({
    projectId: DRIVE_PROJECT_ID,
    bucket: DRIVE_BUCKET,
    ...(contentType ? { contentType } : {}),
  });
  const endpoint = `${DRIVE_API_BASE_URL}/api/v1/storage/presigned-url/${encodeURIComponent(key)}?${search.toString()}`;
  let response: Response | undefined;
  for (let attempt = 0; attempt <= DRIVE_UPLOAD_REQUEST_RETRIES; attempt += 1) {
    response = await fetchWithTimeout(endpoint, {
      headers: headers(),
      cache: 'no-store',
    }, DRIVE_UPLOAD_REQUEST_TIMEOUT_MS);
    if (response.ok || response.status < 500 || attempt === DRIVE_UPLOAD_REQUEST_RETRIES) {
      break;
    }
    await new Promise(resolve => window.setTimeout(resolve, 350 * (attempt + 1)));
  }
  if (!response) {
    throw new Error('Unable to create Drive upload URL.');
  }
  if (!response.ok) {
    throw new Error(await readDriveError(
      response,
      `Unable to create Drive upload URL (${response.status}).`,
    ));
  }
  return response.json() as Promise<{ url: string }>;
};

/** Create a short-lived Drive download URL without exposing the project key. */
export const driveCreatePresignedDownload = async (
  key: string,
  options?: { downloadName?: string },
): Promise<{ url: string }> => {
  const search = new URLSearchParams({
    projectId: DRIVE_PROJECT_ID,
    bucket: DRIVE_BUCKET,
    key,
    // Full-video playback can legitimately last longer than a short preview
    // or download request. Keep this as a one-day bearer URL; the Drive API
    // still authorizes the request before issuing it.
    expiresInSeconds: '18000',
  });
  if (options?.downloadName) {
    search.set('download', '1');
    search.set('downloadName', options.downloadName);
  }
  const response = await fetchWithTimeout(
    `${DRIVE_API_BASE_URL}/api/v1/files/download?${search.toString()}`,
    { headers: headers(), cache: 'no-store' },
    DRIVE_UPLOAD_REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(await readDriveError(
      response,
      `Unable to create Drive download URL (${response.status}).`,
    ));
  }
  const data = await response.json() as { url?: string };
  if (!data.url) { throw new Error('Drive download response did not include a URL.'); }
  return { url: data.url };
};

export const driveFinalizeUpload = async (key: string) => {
  const response = await fetchWithTimeout(`${DRIVE_API_BASE_URL}/api/v1/storage/finalize`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectId: DRIVE_PROJECT_ID, bucket: DRIVE_BUCKET, key }),
    cache: 'no-store',
  }, DRIVE_MUTATION_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(await readDriveError(response, 'Unable to finalize Drive upload.'));
  }
  return response.json();
};

export const driveObjectExists = async (key: string) => {
  const response = await fetchWithTimeout(
    `${DRIVE_API_BASE_URL}/api/v1/storage/object/${key.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'HEAD',
      headers: headers(),
      cache: 'no-store',
    },
    DRIVE_UPLOAD_REQUEST_TIMEOUT_MS,
  );
  if (response.status === 404) { return false; }
  if (response.status === 405 || response.status === 501) {
    const objects = await driveList(key, 10000);
    return objects.some(object => object.fileName === key);
  }
  if (!response.ok) {
    throw new Error(await readDriveError(
      response,
      `Unable to verify Drive object (${response.status}).`,
    ));
  }
  return true;
};

const driveMultipartRequest = async (
  body: Record<string, unknown>,
  abortSignal?: AbortSignal,
) => {
  const action = typeof body.action === 'string' ? body.action : 'multipart';
  const maxAttempts = action === 'abort' ? 1 : DRIVE_MULTIPART_REQUEST_RETRIES + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        PATH_API_STORAGE_MULTIPART,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal: abortSignal,
        },
        DRIVE_UPLOAD_REQUEST_TIMEOUT_MS,
      );
      const data = await response.json().catch(() => ({} as DriveMultipartBridgeResponse));
      if (!response.ok) {
        throw new Error(data.error || `Drive multipart ${action} request failed.`);
      }
      return data;
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }
      if (attempt >= maxAttempts - 1) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        throw new Error(
          message || `Drive multipart ${action} request failed before the server responded.`,
        );
      }
      await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw new Error(`Drive multipart ${action} request failed.`);
};

const uploadDriveMultipartPart = async (
  url: string,
  blob: Blob,
  onPartProgress?: (loaded: number) => void,
  abortSignal?: AbortSignal,
) => {
  const totalPartBytes = typeof blob.size === 'number' ? blob.size : 0;
  return new Promise<string>((resolve, reject) => {
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
    const resolveOnce = (etag: string) => {
      if (settled) { return; }
      settled = true;
      clearStallTimer();
      resolve(etag);
    };
    const resetStallTimer = () => {
      clearStallTimer();
      stallTimer = window.setTimeout(() => {
        rejectOnce(new Error('Multipart upload stalled before Drive-backed storage finished. Retry the upload.'));
        xhr.abort();
      }, DRIVE_UPLOAD_STALL_TIMEOUT_MS);
    };

    xhr.open('PUT', url);
    xhr.timeout = 0;
    resetStallTimer();
    xhr.upload.onprogress = event => {
      resetStallTimer();
      const loaded = Math.min(
        totalPartBytes || event.loaded,
        event.loaded,
      );
      onPartProgress?.(loaded);
    };
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('etag') || xhr.getResponseHeader('ETag') || '';
      if (xhr.status < 200 || xhr.status >= 300) {
        rejectOnce(new Error(xhr.responseText || `Multipart upload part failed with status ${xhr.status}.`));
        return;
      }
      if (!etag) {
        rejectOnce(new Error(
          'Multipart upload part completed without an ETag response header. ' +
          'Expose ETag in the bucket CORS config with Access-Control-Expose-Headers.',
        ));
        return;
      }
      resolveOnce(etag.replace(/^W\//, '').trim());
    };
    xhr.onerror = () => rejectOnce(new Error(
      'Multipart upload failed before Drive-backed storage returned a response. ' +
      'Check bucket CORS, network stability, and upload URL expiry.',
    ));
    xhr.ontimeout = () => rejectOnce(new Error(
      'Multipart upload timed out before Drive-backed storage finished. Retry the upload.',
    ));
    xhr.onabort = () => rejectOnce(new DOMException('The upload was canceled.', 'AbortError'));
    abortSignal?.addEventListener('abort', () => xhr.abort(), { once: true });
    if (abortSignal?.aborted) {
      xhr.abort();
      return;
    }
    xhr.send(blob);
  });
};

const driveUploadMultipartFromClient = async (
  file: File | Blob,
  key: string,
  onUploadProgress?: OnUploadProgressCallback,
  abortSignal?: AbortSignal,
) => {
  const totalBytes = typeof file.size === 'number' ? file.size : 0;
  const start = await driveMultipartRequest({
    action: 'start',
    key,
    contentType: file.type || undefined,
  }, abortSignal);
  const uploadId = start.uploadId;
  if (!uploadId) {
    throw new Error('Drive multipart upload did not return an uploadId.');
  }

  const partsByNumber = new Map<number, DriveMultipartPart>();
  const partCount = Math.max(1, Math.ceil(totalBytes / DRIVE_MULTIPART_PART_SIZE_BYTES));
  const plannedParts: DriveMultipartPartPlan[] = Array.from({ length: partCount }, (_, index) => {
    const start = index * DRIVE_MULTIPART_PART_SIZE_BYTES;
    const end = Math.min(totalBytes, start + DRIVE_MULTIPART_PART_SIZE_BYTES);
    return {
      partNumber: index + 1,
      start,
      end,
      size: Math.max(0, end - start),
    };
  });
  const loadedBytesByPart = new Map<number, number>();
  let completedBytes = 0;

  const emitAggregateProgress = () => {
    const inFlightBytes = Array.from(loadedBytesByPart.values())
      .reduce((sum, value) => sum + value, 0);
    const loaded = Math.min(totalBytes, completedBytes + inFlightBytes);
    onUploadProgress?.({
      loaded,
      total: totalBytes,
      percentage: totalBytes > 0 ? loaded / totalBytes : 1,
    });
  };

  try {
    let nextPartIndex = 0;
    const partUrlRequests = new Map<number, Promise<string>>();

    const requestPartUploadUrl = (partNumber: number) => {
      const existing = partUrlRequests.get(partNumber);
      if (existing) {
        return existing;
      }
      const request = driveMultipartRequest({
        action: 'part',
        key,
        uploadId,
        partNumber,
      }, abortSignal)
        .then(part => {
          if (!part.url) {
            throw new Error(
              `Drive multipart upload did not return a URL for part ${partNumber}.`,
            );
          }
          return part.url;
        })
        .catch(error => {
          // Do not cache failed presign attempts, so workers can retry.
          partUrlRequests.delete(partNumber);
          throw error;
        });
      partUrlRequests.set(partNumber, request);
      return request;
    };

    const prefetchPartUploadUrls = (fromPartIndex: number) => {
      const lookahead = Math.min(
        DRIVE_MULTIPART_MAX_PART_URL_LOOKAHEAD,
        Math.max(
          DRIVE_MULTIPART_CONCURRENCY,
          DRIVE_MULTIPART_PART_URL_LOOKAHEAD,
        ),
      );
      const endPartIndex = Math.min(plannedParts.length, fromPartIndex + lookahead);
      for (let index = fromPartIndex; index < endPartIndex; index += 1) {
        const partNumber = plannedParts[index]?.partNumber;
        if (typeof partNumber !== 'number') {
          continue;
        }
        if (!partUrlRequests.has(partNumber)) {
          void requestPartUploadUrl(partNumber).catch(() => undefined);
        }
      }
    };

    prefetchPartUploadUrls(0);

    const uploadPlannedPart = async (plan: DriveMultipartPartPlan) => {
      const partBlob = file.slice(plan.start, plan.end);
      for (let attempt = 0; attempt <= DRIVE_MULTIPART_PART_UPLOAD_RETRIES; attempt += 1) {
        if (abortSignal?.aborted) {
          throw new DOMException('The upload was canceled.', 'AbortError');
        }
        try {
          const partUrl = await requestPartUploadUrl(plan.partNumber);
          partUrlRequests.delete(plan.partNumber);
          loadedBytesByPart.set(plan.partNumber, 0);
          emitAggregateProgress();
          const etag = await uploadDriveMultipartPart(
            partUrl,
            partBlob,
            loaded => {
              loadedBytesByPart.set(plan.partNumber, Math.min(plan.size, loaded));
              emitAggregateProgress();
            },
            abortSignal,
          );
          loadedBytesByPart.delete(plan.partNumber);
          completedBytes += plan.size;
          emitAggregateProgress();
          const part = { partNumber: plan.partNumber, etag };
          partsByNumber.set(plan.partNumber, part);
          return part;
        } catch (error) {
          partUrlRequests.delete(plan.partNumber);
          loadedBytesByPart.delete(plan.partNumber);
          emitAggregateProgress();
          if (
            isAbortError(error) ||
            attempt >= DRIVE_MULTIPART_PART_UPLOAD_RETRIES
          ) {
            throw error;
          }
          await new Promise(resolve => {
            window.setTimeout(resolve, 500 * (attempt + 1));
          });
        }
      }

      throw new Error(`Drive multipart upload part ${plan.partNumber} failed.`);
    };

    const runPartWorker = async () => {
      while (nextPartIndex < plannedParts.length) {
        if (abortSignal?.aborted) {
          throw new DOMException('The upload was canceled.', 'AbortError');
        }
        const plan = plannedParts[nextPartIndex];
        nextPartIndex += 1;
        if (!plan) {
          return;
        }
        prefetchPartUploadUrls(nextPartIndex);
        await uploadPlannedPart(plan);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(DRIVE_MULTIPART_CONCURRENCY, plannedParts.length) }, () =>
        runPartWorker())
    );

    onUploadProgress?.({
      loaded: totalBytes,
      total: totalBytes,
      percentage: 1,
    });

    const completedParts = plannedParts.map(({ partNumber }) => {
      const part = partsByNumber.get(partNumber);
      if (!part) {
        throw new Error(
          `Drive multipart upload is missing completed metadata for part ${partNumber}.`,
        );
      }
      return part;
    });

    try {
      await driveMultipartRequest({
        action: 'complete',
        key,
        uploadId,
        parts: completedParts,
      }, abortSignal);
    } catch (error) {
      const exists = await driveObjectExists(key).catch(() => false);
      if (!exists) {
        throw error;
      }
    }
    return objectUrlForKey(key);
  } catch (error) {
    await driveMultipartRequest({
      action: 'abort',
      key,
      uploadId,
    }).catch(() => undefined);
    throw error;
  }
};

export const driveUploadFromClient = async (
  file: File | Blob,
  key: string,
  onUploadProgress?: OnUploadProgressCallback,
  abortSignal?: AbortSignal,
) => {
  const totalUploadBytes = typeof file.size === 'number' ? file.size : 0;
  if (typeof file.size === 'number' && file.size >= DRIVE_MULTIPART_THRESHOLD_BYTES) {
    return driveUploadMultipartFromClient(file, key, onUploadProgress, abortSignal);
  }

  const triggerFinalizeUpload = () =>
    fetch(`${PATH_API_PRESIGNED_URL}/${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: abortSignal,
      keepalive: true,
    }).catch(() => undefined);
  let finalizeUploadPromise: Promise<Response | undefined> | undefined;
  const startFinalizeUpload = () => {
    finalizeUploadPromise ??= triggerFinalizeUpload();
    return finalizeUploadPromise;
  };

  const presignResponse = await fetchWithTimeout(
    `${PATH_API_PRESIGNED_URL}/${encodeURIComponent(key)}`,
    { signal: abortSignal },
    DRIVE_UPLOAD_REQUEST_TIMEOUT_MS,
  );
  if (!presignResponse.ok) {
    const data = await presignResponse.json().catch(() => ({} as { error?: string }));
    throw new Error(data.error || 'Unable to create Drive upload URL.');
  }
  const presignedUrl = (await presignResponse.text()).trim();
  let uploadResponse: Response | undefined;
  let uploadError: unknown;
  let didSendFullPayload = false;

  try {
    uploadResponse = await new Promise<Response>((resolve, reject) => {
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
            'Upload stalled before Drive-backed storage returned a response. Retry the upload.',
          ));
          xhr.abort();
        }, DRIVE_UPLOAD_STALL_TIMEOUT_MS);
      };

      xhr.open('PUT', presignedUrl);
      xhr.timeout = 0;
      xhr.responseType = 'text';
      if (file.type) {
        xhr.setRequestHeader('Content-Type', file.type);
      }
      resetStallTimer();
      xhr.upload.onprogress = event => {
        resetStallTimer();
        const totalBytes = event.lengthComputable
          ? event.total
          : totalUploadBytes;
        const loadedBytes = Math.min(totalBytes || event.loaded, event.loaded);
        if (totalBytes > 0 && loadedBytes >= totalBytes) {
          didSendFullPayload = true;
          void startFinalizeUpload();
        }
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
      xhr.onerror = () => rejectOnce(new Error(
        'Upload failed before Drive-backed storage returned a response. ' +
        'Check bucket CORS, network stability, and upload URL expiry.',
      ));
      xhr.ontimeout = () => rejectOnce(new Error(
        'Upload timed out before Drive-backed storage finished. Retry the upload.',
      ));
      xhr.onabort = () => rejectOnce(new DOMException('The upload was canceled.', 'AbortError'));
      abortSignal?.addEventListener('abort', () => xhr.abort(), { once: true });
      if (abortSignal?.aborted) {
        xhr.abort();
        return;
      }
      xhr.send(file);
    });
  } catch (error) {
    uploadError = error;
  }

  if (uploadResponse?.ok) {
    void startFinalizeUpload();
    return objectUrlForKey(key);
  }

  let finalizeResponse: Response | undefined;
  if (didSendFullPayload || uploadResponse) {
    finalizeResponse = await startFinalizeUpload();
  }

  if (uploadResponse && !uploadResponse.ok && !finalizeResponse?.ok) {
    const exists = await driveObjectExists(key).catch(() => false);
    if (exists) {
      void startFinalizeUpload();
      return objectUrlForKey(key);
    }
    throw new Error(await uploadResponse.text() || 'Upload failed.');
  }

  if (didSendFullPayload) {
    const exists = await driveObjectExists(key).catch(() => false);
    if (exists) {
      void startFinalizeUpload();
      return objectUrlForKey(key);
    }
  }

  if (!finalizeResponse?.ok) {
    const exists = await driveObjectExists(key).catch(() => false);
    if (exists) {
      void startFinalizeUpload();
      return objectUrlForKey(key);
    }
    const data = await finalizeResponse?.json().catch(() => ({} as { error?: string }));
    if (uploadError) {
      throw uploadError;
    }
    throw new Error(data?.error || 'Unable to finalize Drive upload.');
  }
  return objectUrlForKey(key);
};

export const driveList = async (prefix: string, limit = 1000) => {
  const search = new URLSearchParams({
    projectId: DRIVE_PROJECT_ID,
    bucket: DRIVE_BUCKET,
    prefix,
    limit: String(limit),
  });
  const response = await fetchWithTimeout(`${DRIVE_API_BASE_URL}/api/v1/storage/list?${search.toString()}`, {
    headers: headers(),
    cache: 'no-store',
  }, DRIVE_LIST_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(await readDriveError(response, 'Unable to list Drive objects.'));
  }
  const data = await response.json() as {
    objects?: Array<{ url: string; fileName: string; uploadedAt?: string | null; size?: number }>
  };
  return (data.objects || []).map(item => ({
    url: item.url,
    fileName: item.fileName,
    uploadedAt: item.uploadedAt ? new Date(item.uploadedAt) : undefined,
    size: typeof item.size === 'number' ? formatBytes(item.size) : undefined,
  }));
};

export const drivePut = async (file: Buffer, fileName: string) => {
  const bytes = new Uint8Array(
    file.buffer as ArrayBuffer,
    file.byteOffset,
    file.byteLength,
  );
  const response = await fetchWithTimeout(`${DRIVE_API_BASE_URL}/api/v1/storage/object/${fileName.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'PUT',
      headers: {
        ...headers(),
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    }, DRIVE_MUTATION_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(await readDriveError(response, 'Unable to upload Drive object.'));
  }
  const data = await response.json() as { url: string };
  return data.url;
};

export const driveDelete = async (url: string) => {
  const key = driveKeyFromUrl(url);
  const response = await fetchWithTimeout(`${DRIVE_API_BASE_URL}/api/v1/storage/object/${key.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: headers(),
  }, DRIVE_MUTATION_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(await readDriveError(response, 'Unable to delete Drive object.'));
  }
};

export const driveCopy = async (originUrl: string, destinationFileName: string) => {
  const response = await fetchWithTimeout(`${DRIVE_API_BASE_URL}/api/v1/storage/copy`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: DRIVE_PROJECT_ID,
      bucket: DRIVE_BUCKET,
      fromKey: driveKeyFromUrl(originUrl),
      toKey: destinationFileName,
    }),
  }, DRIVE_MUTATION_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(await readDriveError(response, 'Unable to copy Drive object.'));
  }
  const data = await response.json() as { url: string };
  return data.url;
};

export const driveMove = async (originUrl: string, destinationFileName: string) => {
  const response = await fetchWithTimeout(`${DRIVE_API_BASE_URL}/api/v1/storage/move`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: DRIVE_PROJECT_ID,
      bucket: DRIVE_BUCKET,
      fromKey: driveKeyFromUrl(originUrl),
      toKey: destinationFileName,
    }),
  }, DRIVE_MUTATION_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(await readDriveError(response, 'Unable to move Drive object.'));
  }
  const data = await response.json() as { url: string };
  return data.url;
};
