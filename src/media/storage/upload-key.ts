export const buildStagedUploadKey = (
  fileName: string,
  uploadId: string,
) => `uploads/${uploadId}/${fileName}`;
