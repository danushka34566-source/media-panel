import {
  getMediaMetaCached,
  getUniqueCategoriesCached,
  countMediaProcessingCached,
  getMediaMostRecentUpdateCached,
  getUniquePerformersCached,
  getUniqueRecipesCached,
  getUniqueStudiosCached,
  getUniqueTagsCached,
  getUniqueVideoContentTypesCached,
} from '@/media/cache';
import {
  PATH_ADMIN_ALBUMS,
  PATH_ADMIN_CATEGORIES,
  PATH_ADMIN_CONTENT_TYPES,
  PATH_ADMIN_MEDIA,
  PATH_ADMIN_PROCESSING,
  PATH_ADMIN_PERFORMERS,
  PATH_ADMIN_RECIPES,
  PATH_ADMIN_STUDIOS,
  PATH_ADMIN_TAGS,
  PATH_ADMIN_USERS,
} from '@/app/path';
import AdminNavClient from './AdminNavClient';
import { getAppText } from '@/i18n/state/server';
import { getAlbumsWithMeta } from '@/album/query';
import { AUTH_USERS_CACHE_TAG, getUsersCount } from '@/auth/users';
import { getUnregisteredStorageUploadsCountCached } from './processing/server';
import { unstable_cache } from 'next/cache';

const getAlbumsCountCached = unstable_cache(
  () => getAlbumsWithMeta().then(albums => albums.length).catch(() => 0),
  ['admin-nav-albums-count'],
  { revalidate: 60 },
);

const getUsersCountCached = unstable_cache(
  () => getUsersCount().catch(() => 0),
  ['admin-nav-users-count'],
  { revalidate: 60, tags: [AUTH_USERS_CACHE_TAG] },
);

const getAdminNavDataCached = unstable_cache(async () => {
  const [
    countMedia,
    countAlbums,
    countCategories,
    countStudios,
    countPerformers,
    countContentTypes,
    countTags,
    countRecipes,
    countUsers,
    countRegistering,
    countVideoProcessing,
    mostRecentMediaUpdateTime,
  ] = await Promise.all([
    getMediaMetaCached({ hidden: 'include' })
      .then(({ count }) => count)
      .catch(() => 0),
    getAlbumsCountCached(),
    getUniqueCategoriesCached().then(categories => categories.length)
      .catch(() => 0),
    getUniqueStudiosCached().then(studios => studios.length)
      .catch(() => 0),
    getUniquePerformersCached().then(performers => performers.length)
      .catch(() => 0),
    getUniqueVideoContentTypesCached().then(contentTypes => contentTypes.length)
      .catch(() => 0),
    getUniqueTagsCached().then(tags => tags.length)
      .catch(() => 0),
    getUniqueRecipesCached().then(recipes => recipes.length)
      .catch(() => 0),
    getUsersCountCached(),
    getUnregisteredStorageUploadsCountCached().catch(() => 0),
    countMediaProcessingCached().catch(() => 0),
    getMediaMostRecentUpdateCached().catch(() => undefined),
  ]);

  return {
    countMedia,
    countAlbums,
    countCategories,
    countStudios,
    countPerformers,
    countContentTypes,
    countTags,
    countRecipes,
    countUsers,
    countRegistering,
    countVideoProcessing,
    mostRecentMediaUpdateTime,
  };
}, ['admin-nav-data-v1'], { revalidate: 30 });

export default async function AdminNav() {
  const [{
    countMedia,
    countAlbums,
    countCategories,
    countStudios,
    countPerformers,
    countContentTypes,
    countTags,
    countRecipes,
    countUsers,
    countRegistering,
    countVideoProcessing,
    mostRecentMediaUpdateTime,
  }, appText] = await Promise.all([
    getAdminNavDataCached(),
    getAppText(),
  ]);

  const includeInsights = countMedia > 0;

  // Media
  const items = [{
    label: appText.photo.photoPlural,
    href: PATH_ADMIN_MEDIA,
    count: countMedia,
  }, {
    label: 'Processing',
    href: PATH_ADMIN_PROCESSING,
    count: countRegistering + countVideoProcessing,
  }];

  // Albums
  if (countAlbums > 0) { items.push({
    label: appText.category.albumPlural,
    href: PATH_ADMIN_ALBUMS,
    count: countAlbums,
  }); }

  if (countCategories > 0) { items.push({
    label: 'Categories',
    href: PATH_ADMIN_CATEGORIES,
    count: countCategories,
  }); }

  if (countStudios > 0) { items.push({
    label: 'Studios',
    href: PATH_ADMIN_STUDIOS,
    count: countStudios,
  }); }

  if (countPerformers > 0) { items.push({
    label: 'Performers',
    href: PATH_ADMIN_PERFORMERS,
    count: countPerformers,
  }); }

  if (countContentTypes > 0) { items.push({
    label: 'Content Types',
    href: PATH_ADMIN_CONTENT_TYPES,
    count: countContentTypes,
  }); }

  // Tags
  if (countTags > 0) { items.push({
    label: appText.category.tagPlural,
    href: PATH_ADMIN_TAGS,
    count: countTags,
  }); }

  // Recipes
  if (countRecipes > 0) { items.push({
    label: appText.category.recipePlural,
    href: PATH_ADMIN_RECIPES,
    count: countRecipes,
  }); }

  items.push({
    label: 'Users',
    href: PATH_ADMIN_USERS,
    count: countUsers,
  });

  return (
    <AdminNavClient {...{
      items,
      mostRecentMediaUpdateTime,
      includeInsights,
    }} />
  );
}
