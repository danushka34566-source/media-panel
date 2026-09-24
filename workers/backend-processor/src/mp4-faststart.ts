import { open } from 'node:fs/promises';

export type Mp4MetadataPlacement = 'front' | 'tail' | 'unknown';

/** Read only top-level atom headers; an mdat body can be hundreds of GB. */
export const getMp4MetadataPlacement = async (
  filePath: string,
): Promise<Mp4MetadataPlacement> => {
  const file = await open(filePath, 'r');
  try {
    const { size: fileSize } = await file.stat();
    const header = Buffer.alloc(16);
    let position = 0;
    let sawMediaData = false;

    while (position + 8 <= fileSize) {
      const { bytesRead } = await file.read(header, 0, 8, position);
      if (bytesRead !== 8) { return 'unknown'; }

      const size32 = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      let atomSize = size32;
      let headerSize = 8;
      if (size32 === 1) {
        const extended = await file.read(header, 8, 8, position + 8);
        if (extended.bytesRead !== 8) { return 'unknown'; }
        const size64 = header.readBigUInt64BE(8);
        if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) { return 'unknown'; }
        atomSize = Number(size64);
        headerSize = 16;
      } else if (size32 === 0) {
        atomSize = fileSize - position;
      }
      if (atomSize < headerSize || atomSize > fileSize - position) {
        return 'unknown';
      }

      if (type === 'moov') { return sawMediaData ? 'tail' : 'front'; }
      if (type === 'mdat') { sawMediaData = true; }
      position += atomSize;
    }
    return 'unknown';
  } finally {
    await file.close();
  }
};
