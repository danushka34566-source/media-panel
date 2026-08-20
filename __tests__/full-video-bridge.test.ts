import {
  getFullVideoBridgeUrl,
  isHlsManifestUrl,
  isLikelyDriveStorageUrl,
  rewriteDriveHlsManifest,
} from '@/media/full-video-bridge';

describe('authenticated Drive full-video bridge', () => {
  it('recognizes Drive storage object paths but leaves previews/providers alone', () => {
    expect(isLikelyDriveStorageUrl(
      'https://drive.example/storage/library/video-hls.m3u8',
    )).toBe(true);
    expect(isLikelyDriveStorageUrl(
      'https://cdn.example/media/video-preview.mp4',
    )).toBe(false);
    expect(getFullVideoBridgeUrl('/storage/library/video.mp4')).toBe(
      '/api/media/full-video?url=%2Fstorage%2Flibrary%2Fvideo.mp4',
    );
  });

  it('rewrites absolute and relative HLS URI references through the bridge', () => {
    const manifestUrl = 'https://drive.example/storage/library/master.m3u8';
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
      'https://drive.example/storage/library/720p/index.m3u8',
      '#EXTINF:4,',
      'segments/00001.m4s',
      '',
    ].join('\n');
    const rewritten = rewriteDriveHlsManifest(manifest, manifestUrl);
    expect(rewritten).toContain(
      'URI="/api/media/full-video?url=https%3A%2F%2Fdrive.example%2Fstorage%2Flibrary%2Fkeys%2Fkey.bin"',
    );
    expect(rewritten).toContain(
      '/api/media/full-video?url=https%3A%2F%2Fdrive.example%2Fstorage%2Flibrary%2F720p%2Findex.m3u8',
    );
    expect(rewritten).toContain(
      '/api/media/full-video?url=https%3A%2F%2Fdrive.example%2Fstorage%2Flibrary%2Fsegments%2F00001.m4s',
    );
  });

  it('detects manifests without treating media bytes as HLS', () => {
    expect(isHlsManifestUrl('https://drive.example/storage/a/master.m3u8')).toBe(true);
    expect(isHlsManifestUrl('https://drive.example/storage/a/video.mp4')).toBe(false);
  });
});
