export type UploadProgressEvent = {
  loaded: number
  total: number
  percentage: number
};

export type OnUploadProgressCallback = (
  event: UploadProgressEvent,
) => void;
