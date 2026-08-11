import { createReadStream, promises as fs } from 'node:fs';

type MultipartRequest = (
  pathname: string,
  init?: RequestInit,
) => Promise<Response>;

type MultipartResponse = {
  uploadId?: string
  url?: string
};

type CompletedPart = {
  partNumber: number
  etag: string
};

const PART_SIZE_BYTES = 16 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;
const PART_RETRIES = 2;

const requestJson = async (
  request: MultipartRequest,
  body: Record<string, unknown>,
) => request('/jobs/storage/multipart', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(response => response.json() as Promise<MultipartResponse>);

const uploadPart = async ({
  filePath,
  start,
  end,
  url,
}: {
  filePath: string
  start: number
  end: number
  url: string
}) => {
  for (let attempt = 0; attempt <= PART_RETRIES; attempt += 1) {
    const stream = createReadStream(filePath, { start, end: end - 1 });
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: stream as any,
        duplex: 'half',
        headers: { 'Content-Length': String(end - start) },
      } as RequestInit & { duplex: 'half' });
      if (!response.ok) {
        throw new Error(`Stream part upload failed (${response.status})`);
      }
      const etag = response.headers.get('etag')?.replace(/^W\//, '').trim();
      if (!etag) { throw new Error('Stream part upload returned no ETag'); }
      return etag;
    } catch (error) {
      stream.destroy();
      if (attempt >= PART_RETRIES) { throw error; }
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error('Stream part upload failed');
};

export const uploadStreamDerivative = async ({
  request,
  filePath,
  key,
  photoId,
  contentType,
  onProgress,
}: {
  request: MultipartRequest
  filePath: string
  key: string
  photoId: string
  contentType: string
  onProgress?: (completed: number, total: number) => void
}) => {
  const { size } = await fs.stat(filePath);
  const start = await requestJson(request, {
    action: 'start',
    key,
    photoId,
    contentType,
  });
  if (!start.uploadId) {
    throw new Error('Stream multipart upload returned no upload ID');
  }
  const plans = Array.from(
    { length: Math.max(1, Math.ceil(size / PART_SIZE_BYTES)) },
    (_, index) => ({
      partNumber: index + 1,
      start: index * PART_SIZE_BYTES,
      end: Math.min(size, (index + 1) * PART_SIZE_BYTES),
    }),
  );
  const completed = new Map<number, CompletedPart>();
  let nextIndex = 0;
  let completedBytes = 0;

  try {
    const worker = async () => {
      while (nextIndex < plans.length) {
        const plan = plans[nextIndex++];
        if (!plan) { return; }
        const part = await requestJson(request, {
          action: 'part',
          key,
          photoId,
          uploadId: start.uploadId,
          partNumber: plan.partNumber,
        });
        if (!part.url) {
          throw new Error(`No upload URL for stream part ${plan.partNumber}`);
        }
        const etag = await uploadPart({
          filePath,
          start: plan.start,
          end: plan.end,
          url: part.url,
        });
        completed.set(plan.partNumber, { partNumber: plan.partNumber, etag });
        completedBytes += plan.end - plan.start;
        onProgress?.(completedBytes, size);
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, plans.length) },
      () => worker(),
    ));
    const parts = plans.map(plan => completed.get(plan.partNumber));
    if (parts.some(part => !part)) {
      throw new Error('Stream multipart upload is missing completed parts');
    }
    await requestJson(request, {
      action: 'complete',
      key,
      photoId,
      uploadId: start.uploadId,
      parts,
    });
    return { key, size };
  } catch (error) {
    await requestJson(request, {
      action: 'abort',
      key,
      photoId,
      uploadId: start.uploadId,
    }).catch(() => undefined);
    throw error;
  }
};
