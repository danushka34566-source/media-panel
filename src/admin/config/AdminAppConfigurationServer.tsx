import AdminAppConfigurationClient from './AdminAppConfigurationClient';
import { APP_CONFIGURATION } from '@/app/config';
import { testConnectionsAction } from '@/admin/actions';
import { getProcessingSettings } from '@/processing/settings';
import {
  getProcessingConnectionSettingsResolution,
} from '@/processing/connection-settings';
import { getSiteAccessSettings } from '@/auth/site-access';
import { getApplicationSettings } from '@/app/application-settings';

export default async function AdminAppConfigurationServer({
  secret,
  simplifiedView,
}: {
  secret: string
  simplifiedView?: boolean
}) {
  const [
    connectionErrors,
    processingSettings,
    processingConnectionSettings,
    siteAccessSettings,
    applicationSettings,
  ] = await Promise.all([
    testConnectionsAction().catch(() => undefined),
    getProcessingSettings().catch(() => undefined),
    getProcessingConnectionSettingsResolution().catch(() => undefined),
    getSiteAccessSettings().catch(() => undefined),
    getApplicationSettings().catch(() => undefined),
  ]);

  return (
    <AdminAppConfigurationClient {...{
      ...APP_CONFIGURATION,
      isStaticallyOptimized: applicationSettings
        ? Object.values(applicationSettings).some(Boolean)
        : APP_CONFIGURATION.isStaticallyOptimized,
      connectionErrors,
      secret,
      processingSettings,
      processingConnectionSettings: processingConnectionSettings && {
        // Show the saved URL and the effective presence of each masked key.
        orchestratorBaseUrl:
          processingConnectionSettings.stored.orchestratorBaseUrl,
        hasOrchestratorSecret: Boolean(
          processingConnectionSettings.effective.orchestratorSharedSecret,
        ),
        hasProcessorSecret: Boolean(
          processingConnectionSettings.effective.processorSharedSecret,
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
