// Upload-key validation does not depend on generated IDs; the ESM-only
// runtime package is incidental to the module's import graph.
jest.mock('nanoid', () => ({
  customAlphabet: () => () => 'test-id',
  nanoid: () => 'test-id',
}));
jest.mock('camelcase-keys', () => ({
  __esModule: true,
  default: (value: unknown) => value,
}));

import { isUploadPathnameValid } from '@/media/storage';

describe('panel upload storage keys', () => {
  it('accepts only a filename at the bucket root', () => {
    expect(isUploadPathnameValid('Same-File.mp4')).toBeTruthy();
    expect(isUploadPathnameValid('uploads/first-upload/Same-File.mp4')).toBeFalsy();
    expect(isUploadPathnameValid('../Same-File.mp4')).toBeFalsy();
  });
});
