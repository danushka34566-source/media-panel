import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOBILE_COMPATIBILITY_ENCODING,
  getCanonicalMp4Strategy,
  getCompatibilityStreamStrategy,
  needsFaststartStream,
  needsCompatibilityStream,
} from '../src/compatibility-stream.js';

test('uses the balanced fast mobile compatibility encoding profile', () => {
  assert.deepEqual(MOBILE_COMPATIBILITY_ENCODING, {
    crf: '20',
    preset: 'veryfast',
    audioBitrate: '192k',
  });
});

test('MKV and HEVC sources receive a mobile-safe stream', () => {
  assert.equal(needsCompatibilityStream('mkv', {
    videoCodec: 'hevc',
    audioCodec: 'aac',
  }), true);
  assert.equal(getCompatibilityStreamStrategy({
    videoCodec: 'hevc',
    audioCodec: 'aac',
  }), 'transcode');
});

test('HEVC can be preserved in canonical MP4 without being used as mobile fallback', () => {
  assert.equal(getCanonicalMp4Strategy({
    videoCodec: 'hevc',
    audioCodec: 'aac',
  }), 'remux');
});

test('browser-safe H264/AAC MP4 sources do not need a duplicate stream', () => {
  assert.equal(needsCompatibilityStream('mp4', {
    videoCodec: 'h264',
    audioCodec: 'aac',
  }), false);
});

test('late-moov H264/AAC MP4 receives a remuxed stream', () => {
  const metadata = { videoCodec: 'h264', audioCodec: 'aac' };
  assert.equal(needsFaststartStream('mp4', metadata, 'tail', false), true);
  assert.equal(needsFaststartStream('MP4', metadata, 'tail', false), true);
  assert.equal(needsFaststartStream('mp4', metadata, 'front', false), false);
  assert.equal(needsFaststartStream('mp4', metadata, 'unknown', false), false);
  assert.equal(needsFaststartStream('mp4', metadata, 'tail', true), false);
});

test('incompatible audio in an MP4 still receives a safe stream', () => {
  assert.equal(needsCompatibilityStream('mp4', {
    videoCodec: 'h264',
    audioCodec: 'dts',
  }), true);
  assert.equal(getCompatibilityStreamStrategy({
    videoCodec: 'h264',
    audioCodec: 'dts',
  }), 'transcode');
});
