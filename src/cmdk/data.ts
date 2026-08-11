import 'server-only';

import { getDataForCategoriesCached } from '@/category/cache';
import { getAppText } from '@/i18n/state/server';
import { photoQuantityText } from '@/media';
import { getMediaMetaCached } from '@/media/cache';
import {
  getUniqueCategories,
  getUniquePerformersWithMeta,
  getUniqueStudiosWithMeta,
  getUniqueVideoContentTypesWithMeta,
} from '@/media/query';

export const getCommandKData = async () => {
  const [
    count,
    categories,
    categoryItems,
    studioItems,
    performerItems,
    contentTypeItems,
  ] = await Promise.all([
    getMediaMetaCached()
      .then(({ count }) => count)
      .catch(() => 0),
    getDataForCategoriesCached(),
    getUniqueCategories().catch(() => []),
    getUniqueStudiosWithMeta().catch(() => []),
    getUniquePerformersWithMeta().catch(() => []),
    getUniqueVideoContentTypesWithMeta().catch(() => []),
  ]);

  const appText = await getAppText();

  return {
    ...categories,
    categories: categoryItems,
    studios: studioItems,
    performers: performerItems,
    contentTypes: contentTypeItems,
    footer: photoQuantityText(count, appText, false),
  };
};

export type CommandKData = Awaited<ReturnType<typeof getCommandKData>>;
