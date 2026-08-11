'use client';

import { Dispatch, SetStateAction } from 'react';
import { UrlAddStatus } from './upload';
import AdminUploadsTableRow from './AdminUploadsTableRow';

export default function AdminUploadsTable({
  hideManualActions,
  isAdding,
  urlAddStatuses,
  setUrlAddStatuses,
  isDeleting,
  setIsDeleting,
}: {
  hideManualActions?: boolean
  isAdding?: boolean
  urlAddStatuses: UrlAddStatus[]
  setUrlAddStatuses?: Dispatch<SetStateAction<UrlAddStatus[]>>
  isDeleting?: boolean
  setIsDeleting?: Dispatch<SetStateAction<boolean>>
}) {
  const isComplete = urlAddStatuses.every(({ status }) => status === 'added');
  return (
    <div className="space-y-4">
      {urlAddStatuses.map((status, index) =>
        <AdminUploadsTableRow
          key={status.url}
          {...{
            ...status,
            tabIndex: index + 1,
            shouldRedirectAfterAction: urlAddStatuses.length <= 1,
            isAdding,
            isDeleting,
            isComplete,
            hideManualActions,
            setIsDeleting,
            setUrlAddStatuses,
          }}
        />,
      )}
    </div>
  );
}
