import assert from 'node:assert/strict';
import test from 'node:test';
import { getEmbeddedSubtitleTracks } from '../src/subtitles.js';

test('keeps every embedded subtitle and preserves track titles', () => {
  assert.deepEqual(getEmbeddedSubtitleTracks([
    { index: 0, codec_type: 'video' },
    { index: 2, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'eng', title: 'English Full' } },
    { index: 3, codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'eng', title: 'English Signs' } },
    { index: 4, codec_type: 'subtitle', codec_name: 'subrip' },
  ]), [
    { streamIndex: 2, language: 'eng', label: 'English Full', token: 'eng', codecName: 'subrip' },
    { streamIndex: 3, language: 'eng', label: 'English Signs', token: 'eng-2', codecName: 'ass' },
    { streamIndex: 4, language: 'und', label: 'Subtitle 3', token: 'track3', codecName: 'subrip' },
  ]);
});

test('ignores malformed and non-subtitle streams', () => {
  assert.deepEqual(getEmbeddedSubtitleTracks([
    { codec_type: 'subtitle' },
    { index: 1, codec_type: 'audio' },
  ]), []);
});
