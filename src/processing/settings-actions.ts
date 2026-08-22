'use server';

import { revalidatePath } from 'next/cache';
import { PATH_ADMIN_CONFIGURATION } from '@/app/path';
import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { parseProcessingSettings } from './settings-schema';
import { saveProcessingSettings } from './settings';
import { saveProcessingConnectionSettings } from './connection-settings';

export type ProcessingSettingsActionState = {
  saved?: boolean
  error?: string
};

export const saveProcessingSettingsAction = async (
  _state: ProcessingSettingsActionState,
  formData: FormData,
): Promise<ProcessingSettingsActionState> =>
  runAuthenticatedAdminServerAction(async () => {
    try {
      const values: Record<string, unknown> = Object.fromEntries(
        formData.entries(),
      );
      values.orchestratorEnabled = formData.has('orchestratorEnabled');
      values.registrationEnabled = formData.has('registrationEnabled');
      values.videoProcessingEnabled = formData.has('videoProcessingEnabled');
      const settings = parseProcessingSettings(values);
      await saveProcessingSettings(settings);
      const orchestratorBaseUrl = formData.get('orchestratorBaseUrl');
      const orchestratorSharedSecret = formData.get('orchestratorSharedSecret');
      const processorSharedSecret = formData.get('processorSharedSecret');
      await saveProcessingConnectionSettings({
        orchestratorBaseUrl: typeof orchestratorBaseUrl === 'string'
          ? orchestratorBaseUrl
          : undefined,
        // Empty password fields intentionally preserve the current secret.
        orchestratorSharedSecret: typeof orchestratorSharedSecret === 'string' &&
          orchestratorSharedSecret.trim()
          ? orchestratorSharedSecret
          : undefined,
        processorSharedSecret: typeof processorSharedSecret === 'string' &&
          processorSharedSecret.trim()
          ? processorSharedSecret
          : undefined,
      });
      revalidatePath(PATH_ADMIN_CONFIGURATION);
      return { saved: true };
    } catch (error) {
      return {
        error: error instanceof Error
          ? error.message
          : 'Unable to save settings',
      };
    }
  }, 'manage-configuration');
