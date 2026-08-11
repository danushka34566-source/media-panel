const uploadAbortControllers = new Map<string, AbortController>();
const uploadRetryHandlers = new Map<string, () => void>();

export const registerUploadAbortController = (
  id: string,
  controller: AbortController,
) => {
  uploadAbortControllers.set(id, controller);
};

export const unregisterUploadAbortController = (id: string) => {
  uploadAbortControllers.delete(id);
};

export const abortClientUpload = (id?: string) => {
  if (!id) { return; }
  uploadAbortControllers.get(id)?.abort();
  uploadAbortControllers.delete(id);
  uploadRetryHandlers.delete(id);
};

export const registerUploadRetryHandler = (
  id: string,
  retry: () => void,
) => {
  uploadRetryHandlers.set(id, retry);
};

export const unregisterUploadRetryHandler = (id: string) => {
  uploadRetryHandlers.delete(id);
};

export const retryClientUpload = (id?: string) => {
  if (!id) { return; }
  uploadRetryHandlers.get(id)?.();
};
