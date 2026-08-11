import { USER_DEFAULT_SORT_OPTIONS } from '@/app/config';
import { MediaQueryOptions } from '@/db';
import { INFINITE_SCROLL_GRID_INITIAL } from '../media';
import { INFINITE_SCROLL_FULL_INITIAL } from '../media/loading-policy';
import { SortBy } from '../media/sort';
import { FEED_MEDIA_REQUEST_LIMIT } from './programmatic';

const FEED_BASE_QUERY_OPTIONS: MediaQueryOptions = {
  excludeFromFeeds: true,
};

// PAGE FEED QUERY OPTIONS

export const getFeedQueryOptions = ({
  isGrid,
  sortBy = USER_DEFAULT_SORT_OPTIONS.sortBy,
  sortWithPriority = USER_DEFAULT_SORT_OPTIONS.sortWithPriority,
}: {
  isGrid: boolean,
  sortBy?: SortBy,
  sortWithPriority?: boolean,
}): MediaQueryOptions => ({
  ...FEED_BASE_QUERY_OPTIONS,
  sortBy,
  sortWithPriority,
  limit: isGrid
    ? INFINITE_SCROLL_GRID_INITIAL
    : INFINITE_SCROLL_FULL_INITIAL,
});

export const FEED_META_QUERY_OPTIONS: MediaQueryOptions = {
  ...FEED_BASE_QUERY_OPTIONS,
};

// APP OG IMAGE QUERY OPTIONS

export const APP_OG_IMAGE_QUERY_OPTIONS: MediaQueryOptions = {
  ...FEED_BASE_QUERY_OPTIONS,
  ...USER_DEFAULT_SORT_OPTIONS,
};

// PROGRAMMATIC FEED QUERY OPTIONS

export const PROGRAMMATIC_QUERY_OPTIONS: MediaQueryOptions = {
  ...FEED_BASE_QUERY_OPTIONS,
  sortBy: 'createdAt',
  limit: FEED_MEDIA_REQUEST_LIMIT,
};
