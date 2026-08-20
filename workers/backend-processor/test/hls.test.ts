import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHlsMasterManifest,
  get720pDimensions,
  getHlsArtifactKeys,
  isHlsArtifactKey,
  parseHlsUris,
  rewriteHlsManifestForStableUrls,
  validateHlsVodManifest,
} from '../src/hls.js';

test('HLS keys are deterministic and flat beside the source', () => {
  assert.deepEqual(getHlsArtifactKeys('movie'), {
    prefix: 'movie-hls',
    manifest: 'movie-hls.m3u8',
    init: 'movie-hls-init.mp4',
  });
  assert.equal(isHlsArtifactKey('movie-hls.m3u8'), true);
  assert.equal(isHlsArtifactKey('movie-hls-init.mp4'), true);
  assert.equal(isHlsArtifactKey('movie-hls-00001.m4s'), true);
  assert.equal(isHlsArtifactKey('movie-hls-high.m3u8'), true);
  assert.deepEqual(getHlsArtifactKeys('movie', '720p'), {
    prefix: 'movie-hls-720p', manifest: 'movie-hls-720p.m3u8', init: 'movie-hls-720p-init.mp4',
  });
  assert.equal(isHlsArtifactKey('../movie-hls-00001.m4s'), false);
});

test('720p rendition fits landscape and portrait sources without upscaling', () => {
  assert.deepEqual(get720pDimensions(1920, 1080), { width: 1280, height: 720 });
  assert.deepEqual(get720pDimensions(1080, 1920), { width: 404, height: 720 });
  assert.deepEqual(get720pDimensions(640, 360), { width: 640, height: 360 });
});

test('fMP4 VOD playlist has deterministic segment URIs', () => {
  const generated = '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n' +
    '#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment-00000.m4s\n#EXT-X-ENDLIST\n';
  assert.deepEqual(parseHlsUris(generated), ['init.mp4', 'segment-00000.m4s']);
  assert.deepEqual(validateHlsVodManifest(generated), ['init.mp4', 'segment-00000.m4s']);
});

test('fMP4 VOD playlist uses absolute stable delivery URLs', () => {
  const generated = '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n' +
    '#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment-00000.m4s\n#EXT-X-ENDLIST\n';
  const stable = rewriteHlsManifestForStableUrls(generated, {
    initUrl: 'https://cdn.example/movie-hls-init.mp4',
    segmentUrlPrefix: 'https://cdn.example/movie-hls-',
  });
  assert.match(stable, /URI="https:\/\/cdn\.example\/movie-hls-init\.mp4"/);
  assert.match(stable, /https:\/\/cdn\.example\/movie-hls-00000\.m4s/);
});

test('master playlist emits accurate rendition metadata without upscaling', () => {
  const master = buildHlsMasterManifest([
    { manifestUrl: 'https://cdn.example/movie-hls-high.m3u8', width: 1920, height: 1080, bandwidth: 2400000 },
    { manifestUrl: 'https://cdn.example/movie-hls-720p.m3u8', width: 720, height: 404, bandwidth: 900000 },
  ]);
  assert.match(master, /BANDWIDTH=2400000/);
  assert.match(master, /RESOLUTION=1920x1080/);
  assert.match(master, /RESOLUTION=720x404/);
  assert.match(master, /https:\/\/cdn\.example\/movie-hls-720p\.m3u8/);
});
