import { NextRequest } from 'next/server';
import { HEAD, GET } from '../app/api/media/full-video/route';
import { isSessionAuthorized } from '@/auth/api';
import {
  driveCreatePresignedDownload,
  driveObjectExists,
} from '@/platforms/storage/drive-gateway';

jest.mock('../src/auth/api', () => ({ isSessionAuthorized: jest.fn() }));
jest.mock('../src/platforms/storage/drive-gateway', () => ({
  isUrlFromDrive: (url: string) => url.startsWith('https://drive.test/storage/b/'),
  driveKeyFromUrl: (url: string) => new URL(url).pathname.slice('/storage/b/'.length),
  driveCreatePresignedDownload: jest.fn(),
  driveObjectExists: jest.fn(),
}));

const sign = jest.mocked(driveCreatePresignedDownload);
const exists = jest.mocked(driveObjectExists);
const request = (name: string, verify = false) => {
  const url = new URL('https://panel.test/api/media/full-video');
  url.searchParams.set('url', 'https://drive.test/storage/b/' + name);
  if (verify) { url.searchParams.set('verify', '1'); }
  return new NextRequest(url);
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(isSessionAuthorized).mockResolvedValue(true);
});
afterEach(() => { jest.useRealTimers(); });

it('issues a fresh delivery URL when the player renews five minutes before expiry', async () => {
  jest.useFakeTimers();
  sign.mockResolvedValueOnce({ url: 'https://delivery.test/first' });
  sign.mockResolvedValueOnce({ url: 'https://delivery.test/second' });
  const first = await HEAD(request('renew.mp4'));
  expect((await GET(request('renew.mp4'))).headers.get('location'))
    .toBe(first.headers.get('x-media-signed-download'));
  jest.setSystemTime(Number(first.headers.get('x-media-signed-download-expires-at')) - 300_000);
  const renewed = await HEAD(request('renew.mp4'));
  expect(renewed.headers.get('x-media-signed-download')).toBe('https://delivery.test/second');
  expect(sign).toHaveBeenCalledTimes(2);
});

it('reuses the playback signature after warmup verifies the file', async () => {
  let finish!: (present: boolean) => void;
  let started!: () => void;
  const checking = new Promise<void>(resolve => { started = resolve; });
  exists.mockImplementation(() => {
    started();
    return new Promise<boolean>(resolve => { finish = resolve; });
  });
  sign.mockResolvedValue({ url: 'https://delivery.test/stream' });
  const warming = HEAD(request('verified.mp4', true));
  await checking;
  expect(sign).not.toHaveBeenCalled();
  const play = await GET(request('verified.mp4'));
  expect(play.headers.get('location')).toBe('https://delivery.test/stream');
  finish(true);
  expect((await warming).status).toBe(204);
  expect(sign).toHaveBeenCalledTimes(1);
});

it('returns no signed URL for a missing compatibility stream or an unauthorized request', async () => {
  sign.mockResolvedValue({ url: 'https://delivery.test/missing' });
  exists.mockResolvedValue(false);
  const missing = await HEAD(request('missing.mp4', true));
  expect(missing.status).toBe(404);
  expect(missing.headers.get('x-media-signed-download')).toBeNull();
  jest.mocked(isSessionAuthorized).mockResolvedValue(false);
  expect((await HEAD(request('missing.mp4'))).status).toBe(401);
  expect(sign).not.toHaveBeenCalled();
});
