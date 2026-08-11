'use server';

import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { getUniqueTags } from '@/media/query';

export const getUniqueTagsAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    try {
      return await getUniqueTags();
    } catch (error) {
      console.error('Error fetching unique tags', error);
      return [];
    }
  });
