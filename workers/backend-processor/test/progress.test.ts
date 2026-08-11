import assert from 'node:assert/strict';
import test from 'node:test';
import { getFfmpegProgressPercent } from '../src/progress.js';

test('uses FFmpeg reported percent when available', () => {
  assert.equal(getFfmpegProgressPercent({ percent: 42.5 }, 100), 42.5);
});

test('derives progress from timemark when percent is unavailable', () => {
  assert.equal(getFfmpegProgressPercent({ timemark: '00:05:00' }, 600), 50);
});

test('caps progress and ignores invalid duration data', () => {
  assert.equal(getFfmpegProgressPercent({ timemark: '00:20:00' }, 600), 100);
  assert.equal(getFfmpegProgressPercent({ timemark: 'invalid' }, 600), undefined);
});
