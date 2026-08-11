'use server';

import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { unstable_cache } from 'next/cache';
import { testRedisConnection } from '@/platforms/redis';
import { testOpenAiConnection } from '@/platforms/openai';
import { testDatabaseConnection } from '@/platforms/postgres';
import { testStorageConnection } from '@/platforms/storage';
import { testGooglePlacesConnection } from '@/platforms/google-places';
import { APP_CONFIGURATION } from '@/app/config';
import {
  getUniqueCategories,
  getMediaTypeCounts,
  getUniqueTags,
  getUniqueRecipes,
} from '@/media/query';
import {
  getMediaMetaCached,
  getMediaInNeedOfUpdateCountCached,
} from '@/media/cache';
import {
  getGitHubMetaForCurrentApp,
  indicatorStatusForSignificantInsights,
} from './insights';
import { getAlbumsWithMeta } from '@/album/query';

const getAlbumsCountCached = unstable_cache(
  () => getAlbumsWithMeta()
    .then(albums => albums.length)
    .catch(() => 0),
  ['admin-albums-count'],
  { revalidate: 60 },
);

const getCategoriesCountCached = unstable_cache(
  () => getUniqueCategories()
    .then(categories => categories.length)
    .catch(() => 0),
  ['admin-categories-count'],
  { revalidate: 60 },
);

const getTagsCountCached = unstable_cache(
  () => getUniqueTags()
    .then(tags => tags.length)
    .catch(() => 0),
  ['admin-tags-count'],
  { revalidate: 60 },
);

const getRecipesCountCached = unstable_cache(
  () => getUniqueRecipes()
    .then(recipes => recipes.length)
    .catch(() => 0),
  ['admin-recipes-count'],
  { revalidate: 60 },
);

export type AdminData = Awaited<ReturnType<typeof getAdminDataAction>>;

export const getAdminDataAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const [
      photosCount,
      photosCountHidden,
      photosCountNeedSync,
      codeMeta,
      albumsCount,
      categoriesCount,
      tagsCount,
      recipesCount,
      mediaTypeCounts,
    ] = await Promise.all([
      getMediaMetaCached()
        .then(({ count }) => count)
        .catch(() => 0),
      getMediaMetaCached({ hidden: 'only' })
        .then(({ count }) => count)
        .catch(() => 0),
      getMediaInNeedOfUpdateCountCached()
        .catch(() => 0),
      getGitHubMetaForCurrentApp(),
      getAlbumsCountCached(),
      getCategoriesCountCached(),
      getTagsCountCached(),
      getRecipesCountCached(),
      getMediaTypeCounts({ hidden: 'include' })
        .catch(() => ({ photos: 0, videos: 0, total: 0 })),
    ]);

    const insightsIndicatorStatus = indicatorStatusForSignificantInsights({
      codeMeta,
      photosCountNeedSync,
    });

    const photosCountTotal = (
      photosCount !== undefined &&
      photosCountHidden !== undefined
    )
      ? photosCount + photosCountHidden
      : undefined;

    return {
      photosCount,
      photosCountHidden,
      photosCountNeedSync,
      photosCountTotal,
      mediaCounts: {
        photos: mediaTypeCounts.photos,
        videos: mediaTypeCounts.videos,
        total: mediaTypeCounts.total,
      },
      uploadsCount: 0,
      albumsCount,
      categoriesCount,
      tagsCount,
      recipesCount,
      insightsIndicatorStatus,
    } as const;
  });

const scanForError = (
  shouldCheck: boolean,
  promise: () => Promise<any>,
): Promise<string> =>
  shouldCheck
    ? promise()
      .then(() => '')
      .catch(error => error.message)
    : Promise.resolve('');

export const testConnectionsAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const {
      hasDatabase,
      hasDriveStorage,
      hasCloudflareR2Storage,
      currentStorage,
      hasRedisStorage,
      hasLocationServices,
      isAiTextGenerationEnabled,
    } = APP_CONFIGURATION;

    const [
      databaseError,
      driveStorageError,
      cloudflareR2StorageError,
      redisError,
      aiError,
      locationError,
    ] = await Promise.all([
      scanForError(hasDatabase, testDatabaseConnection),
      scanForError(
        currentStorage === 'drive' && hasDriveStorage,
        () => testStorageConnection('drive'),
      ),
      scanForError(
        currentStorage === 'cloudflare-r2' && hasCloudflareR2Storage,
        () => testStorageConnection('cloudflare-r2'),
      ),
      scanForError(hasRedisStorage, testRedisConnection),
      scanForError(isAiTextGenerationEnabled, testOpenAiConnection),
      scanForError(hasLocationServices, testGooglePlacesConnection),
    ]);

    return {
      databaseError,
      driveStorageError,
      cloudflareR2StorageError,
      redisError,
      aiError,
      locationError,
    };
  });
