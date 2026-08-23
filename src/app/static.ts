import { CategoryKey } from '../category';
import {
  CATEGORY_VISIBILITY,
  IS_BUILDING,
} from '@/app/config';
import { getPublicMediaIds } from '@/media/query';
import { depluralize, pluralize } from '@/utility/string';
import { getApplicationSettingsSafe } from './application-settings';

type StaticOutput = 'page' | 'image';

const logStaticGenerationDetails = (count: number, content: string) => {
  if (count > 0) {
    const label = pluralize(count, content, undefined, 3);
    console.log(`>  Statically generating ${label} ...`);
  }
};

export const staticallyGenerateMediaIfConfigured = (type: StaticOutput) =>
  async () => {
    const settings = await getApplicationSettingsSafe();
    const enabled = type === 'page'
      ? settings.staticMediaPages
      : settings.staticMediaOgImages;
    if (!enabled) { return []; }
    const photoIds = await getPublicMediaIds({})
      .catch(e => {
        console.error(`Error fetching static photo data: ${e}`);
        return [];
      });
    if (IS_BUILDING) {
      logStaticGenerationDetails(photoIds.length, `photo ${type}`);
    }
    return photoIds.map(photoId => ({ photoId }));
  };

export const staticallyGenerateCategoryIfConfigured = <T, K>(
  key: CategoryKey,
  type: StaticOutput,
  getData: () => Promise<T[]>,
  formatData: (data: T[]) => K[],
): (() => Promise<K[]>) | undefined =>
  CATEGORY_VISIBILITY.includes(key)
    ? async () => {
      const settings = await getApplicationSettingsSafe();
      const enabled = type === 'page'
        ? settings.staticMediaCategories
        : settings.staticMediaCategoryOgImages;
      if (!enabled) { return []; }
      const data = await getData()
        .catch(e => {
          console.error(`Error fetching static ${key} data: ${e}`);
          return [];
        });
      if (IS_BUILDING) {
        logStaticGenerationDetails(
          data.length,
          `${depluralize(key)} ${type}`,
        );
      }
      return formatData(data);
    }
    : undefined;
