jest.mock('../src/app/path', () => ({
  doesPathOfferSort: (pathname: string) =>
    pathname === '/' ||
    pathname.startsWith('/grid') ||
    pathname.startsWith('/full'),
  PARAM_SORT_ORDER_ASCENDING: 'ascending',
  PARAM_SORT_ORDER_DESCENDING: 'descending',
  PARAM_SORT_TYPE_COLOR: 'chromatic',
  PARAM_SORT_TYPE_TAKEN_AT: 'taken-at',
  PARAM_SORT_TYPE_UPLOADED_AT: 'uploaded-at',
  PATH_FULL_INFERRED: '/full',
  PATH_GRID_INFERRED: '/',
}));

jest.mock('../src/app/config', () => ({
  GRID_HOMEPAGE_ENABLED: true,
  USER_DEFAULT_SORT_BY: 'takenAt',
  USER_DEFAULT_SORT_WITH_PRIORITY: false,
}));

import {
  getPathForSortBy,
  hasExplicitMediaSort,
} from '../src/media/sort/path';

describe('media sort paths', () => {
  it('distinguishes bare preference routes from explicit sort routes', () => {
    expect(hasExplicitMediaSort('/grid')).toBe(false);
    expect(hasExplicitMediaSort('/full')).toBe(false);
    expect(hasExplicitMediaSort('/grid/taken-at/descending')).toBe(true);
    expect(hasExplicitMediaSort('/full/uploaded-at/ascending')).toBe(true);
    expect(hasExplicitMediaSort('/tag/example/media-id')).toBe(false);
  });

  it('keeps all four date sort choices explicit for account persistence', () => {
    expect(getPathForSortBy('/grid', 'takenAt')).toBe(
      '/grid/taken-at/descending',
    );
    expect(getPathForSortBy('/grid', 'takenAtAsc')).toBe(
      '/grid/taken-at/ascending',
    );
    expect(getPathForSortBy('/full', 'createdAt')).toBe(
      '/full/uploaded-at/descending',
    );
    expect(getPathForSortBy('/full', 'createdAtAsc')).toBe(
      '/full/uploaded-at/ascending',
    );
  });
});
