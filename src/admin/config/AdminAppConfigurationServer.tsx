import AdminAppConfigurationClient from './AdminAppConfigurationClient';
import { APP_CONFIGURATION } from '@/app/config';
import { testConnectionsAction } from '@/admin/actions';
import { generateAuthSecret } from '@/auth';
import { getProcessingSettingsSafe } from '@/processing/settings';
import {
  getProcessingConnectionSettingsResolutionSafe,
} from '@/processing/connection-settings';
import { getSiteAccessSettingsSafe } from '@/auth/site-access';
import { getApplicationSettingsSafe } from '@/app/application-settings';

export default async function AdminAppConfigurationServer({
  simplifiedView,
}: {
  simplifiedView?: boolean
}) {
  const [
    connectionErrors,
    secret,
    processingSettings,
    processingConnectionSettings,
    siteAccessSettings,
    applicationSettings,
  ] = await Promise.all([
    testConnectionsAction().catch(() => ({})),
    generateAuthSecret(),
    getProcessingSettingsSafe(),
    getProcessingConnectionSettingsResolutionSafe(),
    getSiteAccessSettingsSafe(),
    getApplicationSettingsSafe(),
  ]);

  return (
    <AdminAppConfigurationClient {...{
      ...APP_CONFIGURATION,
      isStaticallyOptimized: Object.values(applicationSettings).some(Boolean),
      areMediaStaticallyOptimized: applicationSettings.staticMediaPages,
      areMediaOGImagesStaticallyOptimized:
        applicationSettings.staticMediaOgImages,
      areMediaCategoriesStaticallyOptimized:
        applicationSettings.staticMediaCategories,
      areMediaCategoryOgImagesStaticallyOptimized:
        applicationSettings.staticMediaCategoryOgImages,
      ...connectionErrors,
      secret,
      processingSettings,
      processingConnectionSettings: {
        // Only show values explicitly saved in the panel. The effective
        // runtime connection may still use environment fallbacks below.
        orchestratorBaseUrl:
          processingConnectionSettings.stored.orchestratorBaseUrl,
        hasOrchestratorSecret: Boolean(
          processingConnectionSettings.stored.orchestratorSharedSecret,
        ),
        hasProcessorSecret: Boolean(
          processingConnectionSettings.stored.processorSharedSecret,
        ),
        isConfigured: Boolean(
          processingConnectionSettings.effective.orchestratorBaseUrl &&
          processingConnectionSettings.effective.orchestratorSharedSecret,
        ),
        usingEnvironmentFallback:
          processingConnectionSettings.usingEnvironmentFallback,
      },
      siteAccessSettings,
      applicationSettings,
      simplifiedView,
    }} />
  );
}
