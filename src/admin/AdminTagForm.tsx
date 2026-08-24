'use client';

import { ReactNode } from 'react';
import AdminMediaLibraryValueForm from './AdminMediaLibraryValueForm';
import { parameterize } from '@/utility/string';
import { PATH_ADMIN_TAGS } from '@/app/path';

export default function AdminTagForm({
  tag,
  children,
}: {
  tag: string
  children?: ReactNode
}) {
  return (
    <AdminMediaLibraryValueForm
      value={tag}
      sourceType="tag"
      label="Tag"
      backPath={PATH_ADMIN_TAGS}
      normalizeValue={parameterize}
    >
      {children}
    </AdminMediaLibraryValueForm>
  );
}
