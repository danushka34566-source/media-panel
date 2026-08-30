import AdminInfoPage from '@/admin/AdminInfoPage';
import BackendStats from '@/admin/stats/BackendStats';
import { getLatestBackendStatusSnapshot } from '@/admin/stats/backend-status-store';

export default async function AdminStatsPage() {
  const initialStatus = await getLatestBackendStatusSnapshot();
  return <AdminInfoPage>
    <BackendStats initialStatus={initialStatus} />
  </AdminInfoPage>;
}
