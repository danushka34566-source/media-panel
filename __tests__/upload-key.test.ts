import { buildStagedUploadKey } from '@/media/storage/upload-key';

describe('panel upload storage keys', () => {
  it('keeps the current filename while isolating each upload', () => {
    expect(buildStagedUploadKey('Same File.mp4', 'first-upload')).toBe(
      'uploads/first-upload/Same File.mp4',
    );
    expect(buildStagedUploadKey('Same File.mp4', 'second-upload')).toBe(
      'uploads/second-upload/Same File.mp4',
    );
  });
});
