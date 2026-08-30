import { getWheresFromOptions } from '@/db';

describe('media query options', () => {
  it('excludes the server-rendered media IDs before pagination', () => {
    expect(getWheresFromOptions({
      excludeIds: ['100000000001', '100000000002'],
    })).toEqual({
      wheres: 'WHERE hidden IS NOT TRUE AND NOT (id = ANY($1::text[]))',
      wheresValues: [['100000000001', '100000000002']],
      lastValuesIndex: 2,
    });
  });

  it('matches every search term without requiring a contiguous phrase', () => {
    const result = getWheresFromOptions({ query: '  alpha   beta  ' });
    expect(result.wheres).toContain('ILIKE ALL($1::text[])');
    expect(result.wheresValues).toEqual([['%alpha%', '%beta%']]);
    expect(result.lastValuesIndex).toBe(2);
  });
});
