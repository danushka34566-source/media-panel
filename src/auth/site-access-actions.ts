'use server';

import { revalidatePath } from 'next/cache';
import { PATH_ADMIN_CONFIGURATION } from '@/app/path';
import { getLoginVerificationEmailError } from './email-delivery';
import { runAuthenticatedAdminServerAction } from './server';
import { getSiteAccessSettings, saveSiteAccessSettings } from './site-access';
import { parseSiteAccessSettings } from './site-access-schema';

export type SiteAccessSettingsActionState = {
  saved?: boolean
  error?: string
};

export const saveSiteAccessSettingsAction = async (
  _state: SiteAccessSettingsActionState,
  formData: FormData,
): Promise<SiteAccessSettingsActionState> =>
  runAuthenticatedAdminServerAction(async () => {
    try {
      const settings = parseSiteAccessSettings({
        siteVisibility: formData.get('siteVisibility'),
        newRegistrationsEnabled: formData.has('newRegistrationsEnabled'),
        loginVerificationRequired:
          formData.has('loginVerificationRequired'),
      });
      if (settings.loginVerificationRequired &&
          !(await getSiteAccessSettings()).loginVerificationRequired) {
        const error = await getLoginVerificationEmailError();
        if (error) { return { error }; }
      }
      await saveSiteAccessSettings(settings);
      revalidatePath(PATH_ADMIN_CONFIGURATION);
      return { saved: true };
    } catch (error) {
      return {
        error: error instanceof Error
          ? error.message
          : 'Unable to save site access settings',
      };
    }
  }, 'manage-configuration');
