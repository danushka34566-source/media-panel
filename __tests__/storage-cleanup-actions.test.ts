import {
  deleteStorageCleanupItem,
  deleteStorageCleanupItems,
  getStorageCleanupSnapshot,
} from '@/admin/storage-cleanup/actions';
import {
  deleteFile,
  getCurrentStorageInventoryPage,
} from '@/platforms/storage';

const sourceKey = 'uploads/source.mp4';
const canonicalKey = 'library/canonical.mp4';
const mediaId = '123456789012';
const sourceTime = new Date('2026-05-01T10:00:00Z');
const canonicalTime = new Date('2026-05-01T10:01:00Z');
const registeredTime = new Date('2026-05-01T10:02:00Z');
const storageUrl = (key: string) => `https://storage.example/${key}`;
const sourceMapping = {
  media_id: mediaId,
  original_file_name: sourceKey,
  stored_file_name: canonicalKey,
  source_url: storageUrl(sourceKey),
  stored_url: storageUrl(canonicalKey),
  updated_at: registeredTime,
};
let sourceMappings: typeof sourceMapping[];
let canonicalMediaUrl: string;
let missingTable: string | undefined;
let tableErrorCode: string;

jest.mock('../src/auth/server', () => ({
  runAuthenticatedAdminServerAction: async <T>(action: () => T) => action(),
}));
jest.mock('../src/platforms/postgres', () => ({
  query: async (sql: string) => {
    if (missingTable && sql.includes(`FROM ${missingTable}`)) {
      throw Object.assign(new Error('The table is unavailable'), {
        code: tableErrorCode,
      });
    }
    return {
      rows: sql.includes('FROM registered_upload_file_map')
        ? sourceMappings
        : sql.includes('FROM media\n') ? [{
          id: mediaId,
          url: canonicalMediaUrl,
        }] : [],
    };
  },
}));
jest.mock('../src/platforms/storage', () => ({
  deleteFile: jest.fn(),
  getCurrentStorageInventoryPage: jest.fn(),
  getFileNamePartsFromStorageUrl: (url: string) => ({
    fileName: new URL(url).pathname.split('/').pop(),
  }),
  getStorageKeyFromUrl: (url: string) =>
    new URL(url).pathname.slice(1),
  storageTypeFromUrl: (url: string) =>
    new URL(url).host === 'storage.example' ? 'drive' : 'cloudflare-r2',
}));

const object = (key: string, sizeBytes = 1024) => ({
  fileName: key,
  url: storageUrl(key),
  uploadedAt: key === canonicalKey ? canonicalTime : sourceTime,
  size: undefined,
  sizeBytes,
});

beforeEach(() => {
  jest.resetAllMocks();
  sourceMappings = [sourceMapping];
  canonicalMediaUrl = storageUrl(canonicalKey);
  missingTable = undefined;
  tableErrorCode = '42P01';
});

it('finds replacements on other pages and retains candidates for review', async () => {
  jest.mocked(getCurrentStorageInventoryPage)
    .mockResolvedValueOnce({
      objects: [object(sourceKey)],
      provider: 'Drive',
      nextContinuationToken: 'audit-next',
    })
    .mockResolvedValueOnce({
      objects: [object(`${canonicalKey}.backup`)],
      provider: 'Drive',
      nextContinuationToken: 'next',
    })
    .mockResolvedValueOnce({
      objects: [object(canonicalKey)],
      provider: 'Drive',
      nextContinuationToken: undefined,
    });

  const audit = await getStorageCleanupSnapshot();
  expect(audit.items.find(item => item.key === sourceKey)).toMatchObject({
    classification: 'source-cleanup',
    canDelete: false,
  });
  expect(getCurrentStorageInventoryPage).toHaveBeenNthCalledWith(
    3,
    canonicalKey,
    'next',
  );
  expect(deleteFile).not.toHaveBeenCalled();
});

it('keeps the audit visible and blocks deletion when replacement lookup fails', async () => {
  jest.mocked(getCurrentStorageInventoryPage)
    .mockResolvedValueOnce({
      objects: [object(sourceKey)],
      provider: 'Drive',
      nextContinuationToken: undefined,
    })
    .mockRejectedValueOnce(new Error('Storage unavailable'));

  const audit = await getStorageCleanupSnapshot();
  expect(audit.items).toEqual([expect.objectContaining({
    key: sourceKey,
    canDelete: false,
  })]);
  expect(audit.errors).toEqual([
    'Unable to verify some storage replacements. Refresh the audit to try again.',
  ]);
  expect(deleteFile).not.toHaveBeenCalled();
});

it.each(['Drive', 'Cloudflare R2'])(
  'blocks single and bulk deletion when a previously audited %s source may have changed',
  async provider => {
    const origin = provider === 'Drive' ? 'https://storage.example' : 'https://r2.example';
    const sourceUrl = `${origin}/${sourceKey}`;
    canonicalMediaUrl = `${origin}/${canonicalKey}`;
    sourceMappings = [{ ...sourceMapping, source_url: sourceUrl, stored_url: canonicalMediaUrl }];
    const canonical = { ...object(canonicalKey), url: canonicalMediaUrl };
    const before = { ...object(sourceKey), url: sourceUrl, etag: 'original' };
    const after = { ...before, etag: 'replacement' };
    const page = { provider, nextContinuationToken: undefined };
    jest.mocked(getCurrentStorageInventoryPage)
      .mockResolvedValueOnce({ ...page, objects: [before, canonical] })
      .mockResolvedValue({ ...page, objects: [after, canonical] });

    const audit = await getStorageCleanupSnapshot();
    expect(audit.items[0]).toMatchObject({
      key: sourceKey, classification: 'source-cleanup', canDelete: false,
    });
    expect(audit.deletionUnavailableReason).toContain('object version');
    await expect(deleteStorageCleanupItem(sourceKey)).rejects.toThrow(
      audit.deletionUnavailableReason,
    );
    await expect(deleteStorageCleanupItems([sourceKey])).resolves.toEqual({
      deleted: [], skipped: [sourceKey], failed: [],
      reason: audit.deletionUnavailableReason,
    });
    expect(getCurrentStorageInventoryPage).toHaveBeenCalledTimes(1);
    expect(deleteFile).not.toHaveBeenCalled();
  },
);

it('blocks cleanup when multiple registration records share the source', async () => {
  sourceMappings.unshift({ ...sourceMapping, media_id: '987654321098' });
  jest.mocked(getCurrentStorageInventoryPage).mockResolvedValueOnce({
    objects: [object(sourceKey), object(canonicalKey)],
    provider: 'Drive',
    nextContinuationToken: undefined,
  });

  const audit = await getStorageCleanupSnapshot();
  expect(audit.items.find(item => item.key === sourceKey)?.classification)
    .toBe('linked');
  expect(getCurrentStorageInventoryPage).toHaveBeenCalledTimes(1);
});

it.each([
  object(`${canonicalKey}.backup`),
  object(canonicalKey, 4096),
  { ...object(canonicalKey), url: 'https://r2.example/library/canonical.mp4' },
  { ...object(canonicalKey), url: storageUrl('another/canonical.mp4') },
  { ...object(canonicalKey), uploadedAt: undefined },
  { ...object(canonicalKey), uploadedAt: new Date('2026-05-01T10:03:00Z') },
])('keeps %p out of the candidate list when proof is incomplete', async candidate => {
  jest.mocked(getCurrentStorageInventoryPage)
    .mockResolvedValueOnce({
      objects: [object(sourceKey)],
      provider: 'Drive',
      nextContinuationToken: undefined,
    })
    .mockResolvedValueOnce({
      objects: [candidate],
      provider: 'Drive',
      nextContinuationToken: undefined,
    });

  const audit = await getStorageCleanupSnapshot();
  expect(audit.items[0]).toMatchObject({ key: sourceKey, classification: 'linked' });
  expect(deleteFile).not.toHaveBeenCalled();
});

it('loads the inventory with missing optional tables and blocks cleanup', async () => {
  missingTable = 'media_deletion_queue';
  jest.mocked(getCurrentStorageInventoryPage).mockResolvedValue({
    objects: [object(sourceKey), object(canonicalKey)],
    provider: 'Drive',
    nextContinuationToken: undefined,
  });

  const audit = await getStorageCleanupSnapshot();
  expect(audit.items).toHaveLength(2);
  expect(audit.errors).toEqual([expect.stringContaining(missingTable)]);
  expect(audit.items.every(item => item.classification !== 'source-cleanup')).toBe(true);
  expect(deleteFile).not.toHaveBeenCalled();
});

it('surfaces database failures other than a missing optional table', async () => {
  missingTable = 'media_deletion_queue';
  tableErrorCode = '42501';
  jest.mocked(getCurrentStorageInventoryPage).mockResolvedValue({
    objects: [object(sourceKey)],
    provider: 'Drive',
    nextContinuationToken: undefined,
  });

  await expect(getStorageCleanupSnapshot()).rejects.toThrow(
    'The table is unavailable',
  );
  expect(deleteFile).not.toHaveBeenCalled();
});

it('blocks cleanup if the source was replaced after it was registered', async () => {
  const overwritten = {
    ...object(sourceKey),
    uploadedAt: new Date('2026-05-01T10:03:00Z'),
  };
  jest.mocked(getCurrentStorageInventoryPage).mockResolvedValue({
    objects: [overwritten, object(canonicalKey)],
    provider: 'Drive',
    nextContinuationToken: undefined,
  });

  const audit = await getStorageCleanupSnapshot();
  expect(audit.items.find(item => item.key === sourceKey)?.classification)
    .toBe('linked');
  expect(deleteFile).not.toHaveBeenCalled();
});
