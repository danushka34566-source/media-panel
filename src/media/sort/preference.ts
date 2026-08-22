import { USER_DEFAULT_SORT_OPTIONS } from '@/app/config';
import { getMediaSortPreferenceAction } from '@/auth/actions';

/** Resolve the saved account sort before the first server-rendered feed page. */
export const getEffectiveMediaSortOptions = async ():
  Promise<typeof USER_DEFAULT_SORT_OPTIONS> => {
  const sortBy = await getMediaSortPreferenceAction().catch(() => null);
  return sortBy
    ? { ...USER_DEFAULT_SORT_OPTIONS, sortBy }
    : USER_DEFAULT_SORT_OPTIONS;
};
