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

  it('uses one latest upload lookup for both recent date limits', () => {
    const result = getWheresFromOptions({ recent: true, studio: 'Studio' });
    expect(result.wheres.replace(/\s+/g, ' ')).toBe([
      'WHERE hidden IS NOT TRUE AND created_at >= (',
      'SELECT MAX(created_at) - INTERVAL \'7 days\' FROM media',
      'HAVING MAX(created_at) >= (now() - INTERVAL \'14 days\')',
      ') AND studio=$1',
    ].join(' '));
    expect(result.wheresValues).toEqual(['Studio']);
    expect(result.lastValuesIndex).toBe(2);
  });
});
