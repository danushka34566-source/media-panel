'use client';

import { useEffect } from 'react';
import { ADMIN_INFO_CONTENT_READY_EVENT } from './navigation-events';

export default function AdminInfoContentReady() {
  useEffect(() => {
    window.dispatchEvent(new Event(ADMIN_INFO_CONTENT_READY_EVENT));
  }, []);

  return null;
}
