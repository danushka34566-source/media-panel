'use client';

import { clsx } from 'clsx/lite';
import AppGrid from '@/components/AppGrid';
import AdminMediaTable from '@/admin/AdminMediaTable';
import PathLoaderButton from '@/components/primitives/PathLoaderButton';
import { PATH_ADMIN_MEDIA, PATH_ADMIN_MEDIA_UPDATES } from '@/app/path';
import { Media } from '@/media';
import { Timezone } from '@/utility/timezone';
import { useAppState } from '@/app/AppState';
import { pluralize } from '@/utility/string';
import IconBroom from '@/components/icons/IconBroom';
import ResponsiveText from '@/components/primitives/ResponsiveText';
import { useAppText } from '@/i18n/state/client';
import SyncColorButton from '@/media/color/SyncColorButton';
import AdminPagination from './AdminPagination';

const pathForAdminMediaPage = (pageNumber: number) =>
  pageNumber <= 1
    ? PATH_ADMIN_MEDIA
    : `${PATH_ADMIN_MEDIA}?page=${pageNumber}`;

export default function AdminMediaClient({
  photos,
  photosCount,
  photosCountNeedsSync,
  hasAiTextGeneration,
  pageNumber,
  pageSize,
  timezone,
  debugColorData,
}: {
  photos: Media[]
  photosCount: number
  photosCountNeedsSync: number
  hasAiTextGeneration: boolean
  pageNumber: number
  pageSize: number
  timezone: Timezone
  debugColorData?: boolean
}) {
  const { uploadState: { isUploading } } = useAppState();

  const appText = useAppText();

  return (
    <AppGrid
      contentMain={
        <div className="space-y-4">
          {(debugColorData || photosCountNeedsSync > 0) &&
          <div className="flex justify-end gap-4">
            {debugColorData &&
              <SyncColorButton />}
            {photosCountNeedsSync > 0 &&
              <PathLoaderButton
                path={PATH_ADMIN_MEDIA_UPDATES}
                icon={<IconBroom
                  size={18}
                  className="translate-x-[-1px]"
                />}
                tooltip={(
                  pluralize(
                    photosCountNeedsSync,
                    appText.photo.photo,
                    appText.photo.photoPlural.toLocaleLowerCase(),
                  ) +
                  ' missing data or AI-generated text'
                )}
                className={clsx(
                  'text-blue-600 dark:text-blue-400',
                  'border border-blue-200 dark:border-blue-800/60',
                  'active:bg-blue-50 dark:active:bg-blue-950/50',
                  'disabled:bg-blue-50 dark:disabled:bg-blue-950/50',
                  isUploading && 'hidden md:inline-flex',
                )}
                spinnerColor="text"
                spinnerClassName="text-blue-200 dark:text-blue-600/40"
                hideText="never"
              >
                <ResponsiveText shortText={photosCountNeedsSync}>
                  {pluralize(
                    photosCountNeedsSync,
                    appText.admin.update,
                    appText.admin.updatePlural,
                  )}
                </ResponsiveText>
              </PathLoaderButton>}
          </div>}
          {/* Use custom spacing to address gap/space-y compatibility quirks */}
          <div className="space-y-[6px] sm:space-y-[10px]">
            <AdminMediaTable
              photos={photos}
              hasAiTextGeneration={hasAiTextGeneration}
              timezone={timezone}
              debugColorData={debugColorData}
            />
            <AdminPagination
              page={pageNumber}
              pageSize={pageSize}
              total={photosCount}
              hrefForPage={pathForAdminMediaPage}
            />
          </div>
        </div>}
    />
  );
}
