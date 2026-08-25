import AdminBatchEditPanelClient from './AdminBatchEditPanelClient';
import { getAdminBatchEditOptionsAction } from './actions';

export default async function AdminBatchEditPanel({
  onBatchActionComplete,
}: {
  onBatchActionComplete?: () => Promise<void>
}) {
  const options = await getAdminBatchEditOptionsAction();
  return (
    <AdminBatchEditPanelClient {...{
      ...options,
      onBatchActionComplete,
    }} />
  );
}
