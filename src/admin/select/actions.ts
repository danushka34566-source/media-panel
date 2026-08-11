'use server';

import { getAlbumsWithMeta } from '@/album/query';
import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { getUniqueTagsCached } from '@/media/cache';

export const getAdminBatchEditOptionsAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const [uniqueAlbums, uniqueTags] = await Promise.all([
      getAlbumsWithMeta().catch(() => []),
      getUniqueTagsCached().catch(() => []),
    ]);
    return { uniqueAlbums, uniqueTags };
  });

export type AdminBatchEditOptions = Awaited<
  ReturnType<typeof getAdminBatchEditOptionsAction>
>;
