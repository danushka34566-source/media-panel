import AdminAppConfigurationClient from './AdminAppConfigurationClient';
import { APP_CONFIGURATION } from '@/app/config';
import { testConnectionsAction } from '@/admin/actions';
import { generateAuthSecret } from '@/auth';
import { getProcessingSettingsSafe } from '@/processing/settings';
import { getSiteAccessSettingsSafe } from '@/auth/site-access';

export default async function AdminAppConfigurationServer({
  simplifiedView,
}: {
  simplifiedView?: boolean
}) {
  const [
    connectionErrors,
    secret,
    processingSettings,
    siteAccessSettings,
  ] = await Promise.all([
    testConnectionsAction().catch(() => ({})),
    generateAuthSecret(),
    getProcessingSettingsSafe(),
    getSiteAccessSettingsSafe(),
  ]);

  return (
    <AdminAppConfigurationClient {...{
      ...APP_CONFIGURATION,
      ...connectionErrors,
      secret,
      processingSettings,
      siteAccessSettings,
      simplifiedView,
    }} />
  );
}
