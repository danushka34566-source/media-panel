import { unstable_cache } from 'next/cache';
import { getCountsForCategories, getDataForCategories } from './data';
import { KEY_MEDIA } from '@/media/cache';

export const getDataForCategoriesCached = unstable_cache(
  getDataForCategories,
  [KEY_MEDIA],
);

export const getCountsForCategoriesCached = unstable_cache(
  getCountsForCategories,
  [KEY_MEDIA],
);
