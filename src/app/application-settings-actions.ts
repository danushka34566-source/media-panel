'use server';

import { revalidatePath } from 'next/cache';
import { PATH_ADMIN_CONFIGURATION } from '@/app/path';
import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { revalidateAllKeysAndPaths } from '@/media/cache';
import {
  ApplicationSettings,
  saveApplicationSettings,
} from './application-settings';

export type ApplicationSettingsActionState = {
  saved?: boolean
  error?: string
};

export const saveApplicationSettingsAction = async (
  _state: ApplicationSettingsActionState,
  formData: FormData,
): Promise<ApplicationSettingsActionState> =>
  runAuthenticatedAdminServerAction(async () => {
    try {
      const settings: Partial<ApplicationSettings> = {
        staticMediaPages: formData.has('staticMediaPages'),
        staticMediaOgImages: formData.has('staticMediaOgImages'),
        staticMediaCategories: formData.has('staticMediaCategories'),
        staticMediaCategoryOgImages: formData.has(
          'staticMediaCategoryOgImages',
        ),
      };
      await saveApplicationSettings(settings);
      // Existing ISR entries should reflect the preference immediately. The
      // selected page types are picked up by the next production build.
      revalidateAllKeysAndPaths();
      revalidatePath(PATH_ADMIN_CONFIGURATION);
      return { saved: true };
    } catch (error) {
      return {
        error: error instanceof Error
          ? error.message
          : 'Unable to save static optimization settings',
      };
    }
  }, 'manage-configuration');
