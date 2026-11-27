import { parseMediaFromDb, type Media, type MediaDb } from '@/media';
import { getMedia, getMediaPage } from '@/media/query';
import { query } from '@/platforms/postgres';

jest.mock('../src/platforms/postgres', () => ({ query: jest.fn() }));
jest.mock('../src/db/query', () => ({
  safelyQuery: (run: () => unknown) => run(),
}));
jest.mock('../src/media', () => ({ parseMediaFromDb: jest.fn() }));
jest.mock('../src/media/storage/virtual', () => ({}));
jest.mock('../src/platforms/storage', () => ({}));

const mediaRow = (id: string, url: string) => ({ id, url }) as MediaDb;
const record = (rows: MediaDb[]) => ({
  rows,
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  fields: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(parseMediaFromDb).mockImplementation(
    row => row as unknown as Media,
  );
});

it('uses a raw lookahead without adding its media to the current page', async () => {
  const first = mediaRow('a', 'https://example.test/a');
  const duplicate = mediaRow('duplicate', 'https://example.test/a');
  const later = mediaRow('b', 'https://example.test/b');
  const select = jest.mocked(query);
  select.mockResolvedValueOnce(record([first, duplicate, later]));
  select.mockResolvedValueOnce(record([later]));

  const options = { excludeFromFeeds: true, limit: 2 };
  await expect(getMediaPage(options)).resolves.toEqual({
    photos: [first], hasMore: true,
  });
  await expect(getMediaPage({ ...options, offset: 2 })).resolves.toEqual({
    photos: [later], hasMore: false,
  });
  expect(select.mock.calls).toEqual([
    [expect.stringContaining('exclude_from_feeds IS NOT TRUE'), [3, 0]],
    [expect.stringContaining('exclude_from_feeds IS NOT TRUE'), [3, 2]],
  ]);
  expect(parseMediaFromDb).toHaveBeenCalledTimes(3);
});

it('keeps a page open when parsing skips every displayed row', async () => {
  const invalid = mediaRow('invalid', 'https://example.test/invalid');
  const later = mediaRow('b', 'https://example.test/b');
  const parse = jest.mocked(parseMediaFromDb);
  parse.mockImplementationOnce(() => { throw new Error('Invalid row'); });
  jest.mocked(query).mockResolvedValueOnce(record([invalid, later]));
  const reportError = jest.spyOn(console, 'error').mockImplementation(() => {});

  try {
    await expect(getMediaPage({ limit: 1 })).resolves.toEqual({
      photos: [], hasMore: true,
    });
    expect(parse).toHaveBeenCalledTimes(1);
  } finally {
    reportError.mockRestore();
  }
});

it('keeps the existing list query limit when no lookahead is requested', async () => {
  const first = mediaRow('a', 'https://example.test/a');
  const select = jest.mocked(query);
  select.mockResolvedValueOnce(record([first]));

  await expect(getMedia({ limit: 2, offset: 6 })).resolves.toEqual([first]);
  expect(select).toHaveBeenCalledWith(expect.any(String), [2, 6]);
});
