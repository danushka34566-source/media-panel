'use server';

import { getAlbumsWithMeta } from '@/album/query';
import { runAuthenticatedAdminServerAction } from '@/auth/server';
import {
  getUniqueCameras,
  getUniqueCategories,
  getUniqueFilms,
  getUniqueFocalLengths,
  getUniqueLenses,
  getUniquePerformers,
  getUniqueRecipes,
  getUniqueStudios,
  getUniqueVideoContentTypes,
} from '@/media/query';
import { getUniqueTagsCached } from '@/media/cache';

export const getAdminBatchEditOptionsAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const [
      uniqueAlbums,
      uniqueTags,
      uniqueCategories,
      uniqueStudios,
      uniquePerformers,
      uniqueContentTypes,
      uniqueRecipes,
      uniqueFilms,
      uniqueCameras,
      uniqueLenses,
      uniqueFocalLengths,
    ] = await Promise.all([
      getAlbumsWithMeta().catch(() => []),
      getUniqueTagsCached().catch(() => []),
      getUniqueCategories().catch(() => []),
      getUniqueStudios().catch(() => []),
      getUniquePerformers().catch(() => []),
      getUniqueVideoContentTypes().catch(() => []),
      getUniqueRecipes().catch(() => []),
      getUniqueFilms().catch(() => []),
      getUniqueCameras().catch(() => []),
      getUniqueLenses().catch(() => []),
      getUniqueFocalLengths().catch(() => []),
    ]);
    return {
      uniqueAlbums,
      uniqueTags,
      uniqueCategories,
      uniqueStudios,
      uniquePerformers,
      uniqueContentTypes,
      uniqueRecipes,
      uniqueFilms,
      uniqueCameras,
      uniqueLenses,
      uniqueFocalLengths,
    };
  });

export type AdminBatchEditOptions = Awaited<
  ReturnType<typeof getAdminBatchEditOptionsAction>
>;
