import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import test from 'node:test';
import {
  generateHlsVod,
  parseHlsUris,
  validateHlsVodManifest,
} from '../src/hls.js';

const execFileAsync = promisify(execFile);

test('FFmpeg produces independently playable fMP4 HLS renditions', async t => {
  const executable = ffmpegPath && existsSync(ffmpegPath) ? ffmpegPath : 'ffmpeg';
  ffmpeg.setFfmpegPath(executable);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-panel-hls-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'source.mp4');
  try {
    await execFileAsync(executable, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=blue:s=640x800:r=24:d=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      inputPath,
    ]);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      t.skip('No FFmpeg executable is installed');
      return;
    }
    throw error;
  }

  const bundle = await generateHlsVod(inputPath, 'fixture', path.join(directory, 'hls'), {
    mediaWidth: 640,
    mediaHeight: 800,
    durationSeconds: 4,
  });
  assert.deepEqual(bundle.renditions.map(item => item.name), ['high', '720p']);
  assert.deepEqual(
    bundle.renditions.map(item => [item.width, item.height]),
    [[640, 800], [576, 720]],
  );
  for (const rendition of bundle.renditions) {
    const manifest = await fs.readFile(rendition.manifest.filePath, 'utf8');
    validateHlsVodManifest(manifest);
    const uris = parseHlsUris(manifest);
    assert.ok(uris.includes('init.mp4'));
    assert.ok(uris.some(uri => /^segment-\d{5}\.m4s$/.test(uri)));
    assert.ok(rendition.artifacts.every(artifact => artifact.size > 0));
  }
});
