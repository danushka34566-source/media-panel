import { isUploadPathnameValid } from '@/media/storage';

describe('panel upload storage keys', () => {
  it('accepts only a filename at the bucket root', () => {
    expect(isUploadPathnameValid('Same-File.mp4')).toBeTruthy();
    expect(isUploadPathnameValid('uploads/first-upload/Same-File.mp4')).toBeFalsy();
    expect(isUploadPathnameValid('../Same-File.mp4')).toBeFalsy();
  });
});
