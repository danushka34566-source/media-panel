'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  getAdminBatchEditOptionsAction,
  type AdminBatchEditOptions,
} from './actions';
import { useSelectMediaState } from './SelectMediaState';

const AdminBatchEditPanelClient = dynamic(
  () => import('./AdminBatchEditPanelClient'),
);

export default function DeferredAdminBatchEditPanel() {
  const { isSelectingMedia } = useSelectMediaState();
  const [options, setOptions] = useState<AdminBatchEditOptions>();

  useEffect(() => {
    if (!isSelectingMedia || options) { return; }
    let isActive = true;
    getAdminBatchEditOptionsAction()
      .then(result => {
        if (isActive) { setOptions(result); }
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, [isSelectingMedia, options]);

  return options
    ? <AdminBatchEditPanelClient {...options} />
    : null;
}
