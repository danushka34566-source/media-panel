import {
  revalidatePath,
  revalidateTag,
  unstable_cache,
  unstable_noStore,
} from 'next/cache';
import {
  getMedia,
  getUniqueCategories,
  getUniqueCameras,
  getUniquePerformers,
  getUniqueTags,
  getUniqueFilms,
  getMediaNearId,
  getMediaMostRecentUpdate,
  getMediaMeta,
  getUniqueFocalLengths,
  getUniqueLenses,
  getUniqueRecipes,
  getUniqueStudios,
  getUniqueVideoContentTypes,
  getUniqueYears,
  countMediaProcessing,
  getPendingMediaProcessing,
  getPendingMediaProcessingCount,
  getMediaInNeedOfUpdateCount,
} from '@/media/query';
import { MediaQueryOptions } from '@/db';
import {
  parseCachedMediaDates,
  parseCachedMediaItemsDates,
  RELATED_GRID_MEDIA_TO_SHOW,
} from '@/media';
import { createCameraKey } from '@/camera';
import {
  PATHS_ADMIN,
  PATHS_TO_CACHE,
  PATH_ADMIN,
  PATH_FULL,
  PATH_GRID,
  PATH_ROOT,
  PREFIX_CAMERA,
  PREFIX_FILM,
  PREFIX_FOCAL_LENGTH,
  PREFIX_LENS,
  PREFIX_RECIPE,
  PREFIX_TAG,
  pathForMedia,
  PREFIX_YEAR,
  PREFIX_ALBUM,
} from '@/app/path';
import { createLensKey } from '@/lens';
import { USER_DEFAULT_SORT_OPTIONS } from '@/app/config';

// Table key
export const KEY_MEDIA     = 'photos';
const KEY_MEDIA_ITEM        = 'media';
// Field keys
const KEY_CAMERAS           = 'cameras';
const KEY_LENSES            = 'lenses';
const KEY_ALBUMS            = 'albums';
const KEY_TAGS              = 'tags';
const KEY_CATEGORIES        = 'categories';
const KEY_STUDIOS           = 'studios';
const KEY_PERFORMERS        = 'performers';
const KEY_CONTENT_TYPES     = 'content-types';
const KEY_FILMS             = 'films';
const KEY_RECIPES           = 'recipes';
const KEY_FOCAL_LENGTHS     = 'focal-lengths';
const KEY_YEARS             = 'years';
// Type keys
const KEY_COUNT             = 'count';
const KEY_DATE_RANGE        = 'date-range';

const getCacheKeyForMediaQueryOptions = (
  options: MediaQueryOptions,
  option: keyof MediaQueryOptions,
): string | null => {
  switch (option) {
  // Complex keys
    case 'camera': {
      const camera = options[option];
      return camera ? `${option}-${createCameraKey(camera)}` : null;
    }
    case 'lens': {
      const lens = options[option];
      return lens ? `${option}-${createLensKey(lens)}` : null;
    }
    case 'album': {
      const album = options[option];
      return album ? album.slug : null;
    }
    case 'takenBefore':
    case 'takenAfterInclusive': 
    case 'updatedBefore': {
      const value = options[option];
      return value ? `${option}-${value.toISOString()}` : null;
    }
    // Primitive keys
    default:
      const value = options[option];
      return value !== undefined ? `${option}-${value}` : null;
  }
};

const getMediaCacheKeys = (options: MediaQueryOptions = {}) => {
  const tags: string[] = [];

  Object.keys(options).forEach(key => {
    const tag = getCacheKeyForMediaQueryOptions(
      options,
      key as keyof MediaQueryOptions,
    );
    if (tag) { tags.push(tag); }
  });

  return tags;
};

const getMediaCacheTags = (options: MediaQueryOptions = {}) => [
  KEY_MEDIA,
  ...getMediaCacheKeys(options),
];

const getCacheOptions = (
  tags: string[],
  revalidate?: number,
) => ({
  tags: Array.from(new Set(tags)),
  ...(revalidate === undefined ? {} : { revalidate }),
});

export const revalidateMediaKey = () =>
  revalidateTag(KEY_MEDIA, 'max');

export const revalidateAlbumsKey = () =>
  revalidateTag(KEY_ALBUMS, 'max');

export const revalidateTagsKey = () =>
  revalidateTag(KEY_TAGS, 'max');

export const revalidateCategoriesKey = () =>
  revalidateTag(KEY_CATEGORIES, 'max');

export const revalidateStudiosKey = () =>
  revalidateTag(KEY_STUDIOS, 'max');

export const revalidatePerformersKey = () =>
  revalidateTag(KEY_PERFORMERS, 'max');

export const revalidateContentTypesKey = () =>
  revalidateTag(KEY_CONTENT_TYPES, 'max');

export const revalidateRecipesKey = () =>
  revalidateTag(KEY_RECIPES, 'max');

export const revalidateCamerasKey = () =>
  revalidateTag(KEY_CAMERAS, 'max');

export const revalidateLensesKey = () =>
  revalidateTag(KEY_LENSES, 'max');

export const revalidateFilmsKey = () =>
  revalidateTag(KEY_FILMS, 'max');

export const revalidateFocalLengthsKey = () =>
  revalidateTag(KEY_FOCAL_LENGTHS, 'max');

export const revalidateYearsKey = () =>
  revalidateTag(KEY_YEARS, 'max');

export const revalidateAllKeys = () => {
  revalidateMediaKey();
  revalidateAlbumsKey();
  revalidateTagsKey();
  revalidateCategoriesKey();
  revalidateStudiosKey();
  revalidatePerformersKey();
  revalidateContentTypesKey();
  revalidateCamerasKey();
  revalidateLensesKey();
  revalidateFilmsKey();
  revalidateRecipesKey();
  revalidateFocalLengthsKey();
  revalidateYearsKey();
};

export const revalidateAdminPaths = () => {
  PATHS_ADMIN.forEach(path => revalidatePath(path));
};

export const revalidateAllKeysAndPaths = () => {
  revalidateAllKeys();
  PATHS_TO_CACHE.forEach(path => revalidatePath(path, 'layout'));
};

export const revalidateMedia = (photoId: string) => {
  // Tags
  revalidateMediaKey();
  revalidateTag(photoId, 'max');
  revalidateYearsKey();
  revalidateCamerasKey();
  revalidateLensesKey();
  revalidateAlbumsKey();
  revalidateTagsKey();
  revalidateCategoriesKey();
  revalidateStudiosKey();
  revalidatePerformersKey();
  revalidateContentTypesKey();
  revalidateFilmsKey();
  revalidateRecipesKey();
  revalidateFocalLengthsKey();
  // Paths
  revalidatePath(pathForMedia({ photo: photoId }), 'layout');
  revalidatePath(PATH_ROOT, 'layout');
  revalidatePath(PATH_GRID, 'layout');
  revalidatePath(PATH_FULL, 'layout');
  revalidatePath(PREFIX_CAMERA, 'layout');
  revalidatePath(PREFIX_LENS, 'layout');
  revalidatePath(PREFIX_ALBUM, 'layout');
  revalidatePath(PREFIX_TAG, 'layout');
  revalidatePath(PREFIX_FILM, 'layout');
  revalidatePath(PREFIX_RECIPE, 'layout');
  revalidatePath(PREFIX_FOCAL_LENGTH, 'layout');
  revalidatePath(PREFIX_YEAR, 'layout');
  revalidatePath(PATH_ADMIN, 'layout');
};

// Cache

export function getMediaCached(id: string, includeHidden?: boolean): Promise<ReturnType<typeof parseCachedMediaDates> | undefined>;
export function getMediaCached(options?: MediaQueryOptions): Promise<ReturnType<typeof parseCachedMediaItemsDates>>;
export function getMediaCached(
  arg?: string | MediaQueryOptions,
  includeHidden?: boolean,
) {
  if (typeof arg === 'string') {
    return unstable_cache(
      () => getMedia(arg, includeHidden),
      [KEY_MEDIA, KEY_MEDIA_ITEM, arg],
      getCacheOptions([KEY_MEDIA, KEY_MEDIA_ITEM, arg]),
    )().then(photo => photo ? parseCachedMediaDates(photo) : undefined);
  }
  const options = arg ?? {};
  return unstable_cache(
    () => getMedia(options),
    [KEY_MEDIA, ...getMediaCacheKeys(options)],
    getCacheOptions(getMediaCacheTags(options)),
  )().then(parseCachedMediaItemsDates);
}

export const getMediaNearIdCached = (
  ...args: Parameters<typeof getMediaNearId>
) => {
  const [photoId, requestedOptions] = args;
  // Detail routes can be statically generated/ISR cached. Reading the
  // account session here made a cache miss call `auth()` during static
  // rendering, which Next.js correctly rejected as DYNAMIC_SERVER_USAGE.
  // Resolve the public default in the cache key instead; account-specific
  // sort controls still update the grid links and explicitly supplied
  // sortBy values continue to take precedence.
  const options = {
    ...USER_DEFAULT_SORT_OPTIONS,
    ...requestedOptions,
  };
  const cacheKeys = [KEY_MEDIA, ...getMediaCacheKeys(options)];
  return unstable_cache(
    getMediaNearId,
    cacheKeys,
    getCacheOptions(cacheKeys),
  )(photoId, options)
    .catch(async error => {
      // Do not turn a transient related-items query failure into a broken
      // detail page. The primary item is independently readable and can
      // render alone.
      console.error('Failed to load related media', { photoId, error });
      const photo = await getMediaCached(photoId);
      return {
        photos: photo ? [photo] : [],
        indexNumber: photo ? 1 : undefined,
      };
    })
    .then(({ photos, indexNumber }) => {
      const photo = photos.find(({ id }) => id === photoId);
      const currentIndex = photos.findIndex(p => p.id === photoId);
      const nextStart = currentIndex >= 0 ? currentIndex + 1 : 1;
      const nextEnd = nextStart + RELATED_GRID_MEDIA_TO_SHOW;
      return {
        photo: photo ? parseCachedMediaDates(photo) : undefined,
        photos: parseCachedMediaItemsDates(photos),
        photosGrid: photos.slice(nextStart, nextEnd),
        indexNumber,
      };
    });
};

export const getMediaMetaCached = unstable_cache(
  getMediaMeta,
  [KEY_MEDIA, KEY_COUNT, KEY_DATE_RANGE],
  getCacheOptions([KEY_MEDIA]),
);

export const getMediaMostRecentUpdateCached =
  unstable_cache(
    () => getMediaMostRecentUpdate(),
    [KEY_MEDIA, KEY_COUNT, KEY_DATE_RANGE],
    getCacheOptions([KEY_MEDIA]),
  );

export const countMediaProcessingCached =
  unstable_cache(
    () => countMediaProcessing(),
    [KEY_MEDIA, 'processing-count'],
    getCacheOptions([KEY_MEDIA]),
  );

export const getPendingMediaProcessingCached = (limit?: number, offset?: number) =>
  unstable_cache(
    () => getPendingMediaProcessing(limit, offset),
    [KEY_MEDIA, 'processing-list', String(limit ?? 1000), String(offset ?? 0)],
    getCacheOptions([KEY_MEDIA], 5),
  )().then(parseCachedMediaItemsDates);

export const getPendingMediaProcessingCountCached = () =>
  unstable_cache(
    getPendingMediaProcessingCount,
    [KEY_MEDIA, 'processing-list-count'],
    getCacheOptions([KEY_MEDIA], 5),
  )();

export const getMediaInNeedOfUpdateCountCached =
  unstable_cache(
    () => getMediaInNeedOfUpdateCount(),
    [KEY_MEDIA, 'needs-update-count'],
    getCacheOptions([KEY_MEDIA]),
  );

export const getUniqueTagsCached =
  unstable_cache(
    getUniqueTags,
    [KEY_MEDIA, KEY_TAGS],
    getCacheOptions([KEY_MEDIA, KEY_TAGS]),
  );

export const getUniqueCategoriesCached =
  unstable_cache(
    getUniqueCategories,
    [KEY_MEDIA, KEY_CATEGORIES],
    getCacheOptions([KEY_MEDIA, KEY_CATEGORIES]),
  );

export const getUniqueStudiosCached =
  unstable_cache(
    getUniqueStudios,
    [KEY_MEDIA, KEY_STUDIOS],
    getCacheOptions([KEY_MEDIA, KEY_STUDIOS]),
  );

export const getUniquePerformersCached =
  unstable_cache(
    getUniquePerformers,
    [KEY_MEDIA, KEY_PERFORMERS],
    getCacheOptions([KEY_MEDIA, KEY_PERFORMERS]),
  );

export const getUniqueVideoContentTypesCached =
  unstable_cache(
    getUniqueVideoContentTypes,
    [KEY_MEDIA, KEY_CONTENT_TYPES],
    getCacheOptions([KEY_MEDIA, KEY_CONTENT_TYPES]),
  );

export const getUniqueCamerasCached =
  unstable_cache(
    getUniqueCameras,
    [KEY_MEDIA, KEY_CAMERAS],
    getCacheOptions([KEY_MEDIA, KEY_CAMERAS]),
  );

export const getUniqueLensesCached =
  unstable_cache(
    getUniqueLenses,
    [KEY_MEDIA, KEY_LENSES],
    getCacheOptions([KEY_MEDIA, KEY_LENSES]),
  );

export const getUniqueFilmsCached =
  unstable_cache(
    getUniqueFilms,
    [KEY_MEDIA, KEY_FILMS],
    getCacheOptions([KEY_MEDIA, KEY_FILMS]),
  );

export const getUniqueRecipesCached =
  unstable_cache(
    getUniqueRecipes,
    [KEY_MEDIA, KEY_RECIPES],
    getCacheOptions([KEY_MEDIA, KEY_RECIPES]),
  );

export const getUniqueFocalLengthsCached =
  unstable_cache(
    getUniqueFocalLengths,
    [KEY_MEDIA, KEY_FOCAL_LENGTHS],
    getCacheOptions([KEY_MEDIA, KEY_FOCAL_LENGTHS]),
  );

export const getUniqueYearsCached =
  unstable_cache(
    getUniqueYears,
    [KEY_MEDIA, KEY_YEARS],
    getCacheOptions([KEY_MEDIA, KEY_YEARS]),
  );

// No store

export function getMediaNoStore(id: string, includeHidden?: boolean): Promise<ReturnType<typeof parseCachedMediaDates> | undefined>;
export function getMediaNoStore(options?: MediaQueryOptions): Promise<ReturnType<typeof parseCachedMediaItemsDates>>;
export function getMediaNoStore(
  arg?: string | MediaQueryOptions,
  includeHidden?: boolean,
) {
  unstable_noStore();
  if (typeof arg === 'string') {
    return getMedia(arg, includeHidden)
      .then(photo => photo ? parseCachedMediaDates(photo) : undefined);
  }
  return getMedia(arg ?? {}).then(parseCachedMediaItemsDates);
}
