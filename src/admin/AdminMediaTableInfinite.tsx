'use client';

import { PATH_ADMIN_MEDIA } from '@/app/path';
import InfiniteMediaScroll from '@/media/InfiniteMediaScroll';
import AdminMediaTable from './AdminMediaTable';
import { ComponentProps } from 'react';

export default function AdminMediaTableInfinite({
  initialOffset,
  itemsPerPage,
  hasAiTextGeneration,
  canEdit,
  canDelete,
  debugColorData,
}: {
  initialOffset: number
  itemsPerPage: number
} & Omit<ComponentProps<typeof AdminMediaTable>, 'photos'>) {
  return (
    <InfiniteMediaScroll
      cacheKey={`page-${PATH_ADMIN_MEDIA}`}
      initialOffset={initialOffset}
      itemsPerPage={itemsPerPage}
      includeHiddenMedia
    >
      {({ key, photos, onLastMediaVisible, revalidateMedia }) =>
        <AdminMediaTable
          key={key}
          photos={photos}
          onLastMediaVisible={onLastMediaVisible}
          revalidateMedia={revalidateMedia}
          hasAiTextGeneration={hasAiTextGeneration}
          canEdit={canEdit}
          canDelete={canDelete}
          debugColorData={debugColorData}
        />}
    </InfiniteMediaScroll>
  );
}
