import { CategoryKey } from '../category';
import {
  CATEGORY_VISIBILITY,
  IS_BUILDING,
  STATICALLY_OPTIMIZED_MEDIA_CATEGORIES,
  STATICALLY_OPTIMIZED_MEDIA_CATEGORY_OG_IMAGES,
  STATICALLY_OPTIMIZED_MEDIA_OG_IMAGES,
  STATICALLY_OPTIMIZED_MEDIA,
} from '@/app/config';
import { GENERATE_STATIC_PARAMS_LIMIT } from '@/db';
import { getPublicMediaIds } from '@/media/query';
import { depluralize, pluralize } from '@/utility/string';
import { getPublicPageBuildOptimizations } from './application-settings';

type StaticOutput = 'page' | 'image';

const logStaticGenerationDetails = (count: number, content: string) => {
  if (count > 0) {
    const label = pluralize(count, content, undefined, 3);
    console.log(`>  Statically generating ${label} ...`);
  }
};

export const staticallyGenerateMediaIfConfigured = (type: StaticOutput) =>
  type === 'page' || (type === 'image' && STATICALLY_OPTIMIZED_MEDIA_OG_IMAGES)
  ? async () => {
    const buildAllPublicPages = type === 'page' &&
      await getPublicPageBuildOptimizations();
    const enabled = type === 'page'
      ? buildAllPublicPages || STATICALLY_OPTIMIZED_MEDIA
      : STATICALLY_OPTIMIZED_MEDIA_OG_IMAGES;
    if (!enabled) { return []; }
    const photoIds = await getPublicMediaIds({
      limit: buildAllPublicPages ? undefined : GENERATE_STATIC_PARAMS_LIMIT,
    })
      .catch(e => {
        console.error(`Error fetching static photo data: ${e}`);
        return [];
      });
    if (IS_BUILDING) {
      logStaticGenerationDetails(photoIds.length, `photo ${type}`);
    }
    return photoIds.map(photoId => ({ photoId }));
  }
  : undefined;

export const staticallyGenerateCategoryIfConfigured = <T, K>(
  key: CategoryKey,
  type: StaticOutput,
  getData: () => Promise<T[]>,
  formatData: (data: T[]) => K[],
): (() => Promise<K[]>) | undefined =>
  CATEGORY_VISIBILITY.includes(key) && (
    type === 'page' ||
    (type === 'image' && STATICALLY_OPTIMIZED_MEDIA_CATEGORY_OG_IMAGES)
  )
    ? async () => {
      const buildAllPublicPages = type === 'page' &&
        await getPublicPageBuildOptimizations();
      const enabled = type === 'page'
        ? buildAllPublicPages || STATICALLY_OPTIMIZED_MEDIA_CATEGORIES
        : STATICALLY_OPTIMIZED_MEDIA_CATEGORY_OG_IMAGES;
      if (!enabled) { return []; }
      const data = (await getData()
        .catch(e => {
          console.error(`Error fetching static ${key} data: ${e}`);
          return [];
        }))
        .slice(0, buildAllPublicPages
          ? undefined
          : GENERATE_STATIC_PARAMS_LIMIT);
      if (IS_BUILDING) {
        logStaticGenerationDetails(
          data.length,
          `${depluralize(key)} ${type}`,
        );
      }
      return formatData(data);
    }
    : undefined;
