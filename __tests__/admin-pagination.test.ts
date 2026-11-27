import { getAdminPageNumber } from '@/admin/pagination';

describe('getAdminPageNumber', () => {
  it('uses the first repeated query value and accepts a valid page', () => {
    expect(getAdminPageNumber(['3', '4'], 15)).toBe(3);
  });

  it.each([
    undefined,
    [],
    '',
    '0',
    '-1',
    '2.5',
    '2items',
    '90071992547409930',
    '9007199254740991',
  ])('falls back to page one for invalid or unsafe value %p', value => {
    expect(getAdminPageNumber(value, 15)).toBe(1);
  });

  it('accepts whitespace around a valid page', () => {
    expect(getAdminPageNumber(' 2 ', 20)).toBe(2);
  });
});
