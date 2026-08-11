import AdminInfoPage from '@/admin/AdminInfoPage';
import BackendStats from '@/admin/stats/BackendStats';

export default function AdminStatsPage() {
  return <AdminInfoPage>
    <BackendStats />
  </AdminInfoPage>;
}
