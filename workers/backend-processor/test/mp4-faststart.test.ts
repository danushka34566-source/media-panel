import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { getMp4MetadataPlacement } from '../src/mp4-faststart.js';

const atom = (type: string, payload = Buffer.alloc(0)) => {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 4, 'ascii');
  payload.copy(result, 8);
  return result;
};

const withMp4 = async (data: Buffer, check: (file: string) => Promise<void>) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mp4-atom-test-'));
  try {
    const file = path.join(dir, 'sample.mp4');
    await writeFile(file, data);
    await check(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test('reads top-level atoms and detects moov before mdat', async () => {
  await withMp4(Buffer.concat([
    atom('ftyp'), atom('moov'), atom('mdat', Buffer.alloc(64)),
  ]), async file => {
    assert.equal(await getMp4MetadataPlacement(file), 'front');
  });
});

test('skips mdat payload and detects moov at the tail', async () => {
  await withMp4(Buffer.concat([
    atom('ftyp'), atom('mdat', Buffer.alloc(1024)), atom('moov'),
  ]), async file => {
    assert.equal(await getMp4MetadataPlacement(file), 'tail');
  });
});

test('handles 64-bit atom sizes and refuses malformed atom boundaries', async () => {
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1, 0);
  extended.write('mdat', 4, 4, 'ascii');
  extended.writeBigUInt64BE(16n, 8);
  await withMp4(Buffer.concat([atom('ftyp'), extended, atom('moov')]),
    async file => {
      assert.equal(await getMp4MetadataPlacement(file), 'tail');
    });

  const malformed = Buffer.alloc(8);
  malformed.writeUInt32BE(1000, 0);
  malformed.write('mdat', 4, 4, 'ascii');
  await withMp4(Buffer.concat([atom('ftyp'), malformed]), async file => {
    assert.equal(await getMp4MetadataPlacement(file), 'unknown');
  });
});
