import { deleteFile } from '@/platforms/storage';
import { cloudflareR2Delete } from '@/platforms/storage/cloudflare-r2';

jest.mock('../src/app/config', () => ({}));
jest.mock('../src/app/path', () => ({}));
jest.mock('../src/utility/nanoid', () => ({}));
jest.mock('../src/platforms/storage/drive-gateway', () => ({
  isUrlFromDrive: () => false,
}));
jest.mock('../src/platforms/storage/cloudflare-r2', () => ({
  CLOUDFLARE_R2_BASE_URL_PUBLIC: 'https://r2.example/bucket',
  isUrlFromCloudflareR2: (url: string) =>
    url.startsWith('https://r2.example/bucket'),
  cloudflareR2Delete: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it('deletes the full verified R2 object key', async () => {
  await deleteFile(
    'https://r2.example/bucket/uploads/my%20video.mp4?x=1',
    'uploads/my video.mp4',
  );
  expect(cloudflareR2Delete).toHaveBeenCalledWith('uploads/my video.mp4');
});

it('rejects a matching URL prefix outside the configured bucket', () => {
  expect(() => deleteFile(
    'https://r2.example/bucket-other/video.mp4',
    'video.mp4',
  ))
    .toThrow('URL is not from configured Cloudflare R2 storage');
  expect(cloudflareR2Delete).not.toHaveBeenCalled();
});
