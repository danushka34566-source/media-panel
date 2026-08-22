import AdminAppConfigurationClient from './AdminAppConfigurationClient';
import { APP_CONFIGURATION } from '@/app/config';
import { testConnectionsAction } from '@/admin/actions';
import { generateAuthSecret } from '@/auth';
import { getProcessingSettingsSafe } from '@/processing/settings';
import { getProcessingConnectionSettingsSafe } from '@/processing/connection-settings';
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
    getProcessingConnectionSettingsSafe(),
    getSiteAccessSettingsSafe(),
    getApplicationSettingsSafe(),
  ]);

  return (
    <AdminAppConfigurationClient {...{
      ...APP_CONFIGURATION,
      ...connectionErrors,
      secret,
      processingSettings,
      processingConnectionSettings: {
        orchestratorBaseUrl: processingConnectionSettings.orchestratorBaseUrl,
        hasOrchestratorSecret: Boolean(
          processingConnectionSettings.orchestratorSharedSecret,
        ),
        hasProcessorSecret: Boolean(
          processingConnectionSettings.processorSharedSecret,
        ),
      },
      siteAccessSettings,
      applicationSettings,
      simplifiedView,
    }} />
  );
}
