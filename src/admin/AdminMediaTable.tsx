'use client';

import { Media, getDisplayTranscodeStatus, titleForMedia } from '@/media';
import AdminTable from './AdminTable';
import { Fragment } from 'react';
import MediaSmall from '@/media/MediaSmall';
import { clsx } from 'clsx/lite';
import { pathForAdminMediaEdit, pathForMedia } from '@/app/path';
import Link from 'next/link';
import MediaDate from '@/media/MediaDate';
import EditButton from './EditButton';
import { useAppState } from '@/app/AppState';
import { RevalidateMedia } from '@/media/InfiniteMediaScroll';
import MediaSyncButton from './MediaSyncButton';
import DeleteMediaButton from './DeleteMediaButton';
import { Timezone } from '@/utility/timezone';
import { photoNeedsToBeUpdated } from '@/media/update';
import MediaVisibilityIcon from '@/media/visibility/MediaVisibilityIcon';
import { doesMediaHaveDefaultVisibility } from '@/media/visibility';
import UpdateTooltip from '@/media/update/UpdateTooltip';
import MediaColors from '@/media/color/MediaColors';
import SyncColorButton from '@/media/color/SyncColorButton';

export default function AdminMediaTable({
  photos,
  onLastMediaVisible,
  revalidateMedia,
  photoIdsSyncing = [],
  hasAiTextGeneration,
  dateType = 'createdAt',
  canEdit = true,
  canDelete = true,
  timezone,
  shouldScrollIntoViewOnExternalSync,
  updateMode,
  debugColorData,
  showStatusLabel = true,
}: {
  photos: Media[],
  onLastMediaVisible?: () => void
  revalidateMedia?: RevalidateMedia
  photoIdsSyncing?: string[]
  hasAiTextGeneration: boolean
  dateType?: 'createdAt' | 'updatedAt'
  canEdit?: boolean
  canDelete?: boolean
  timezone?: Timezone
  shouldScrollIntoViewOnExternalSync?: boolean
  // Only sync color data where possible
  updateMode?: boolean
  debugColorData?: boolean
  showStatusLabel?: boolean
}) {
  const { invalidateSwr } = useAppState();

  const opacityForMediaId = (photoId: string) =>
    photoIdsSyncing.length > 0 && !photoIdsSyncing.includes(photoId)
      ? 'opacity-40'
      : undefined;

  return (
    <AdminTable>
      {photos.map((photo, index) => {
        const statusLabel = getDisplayTranscodeStatus(photo);
        return <Fragment key={photo.id}>
          <MediaSmall
            photo={photo}
            onVisible={index === photos.length - 1
              ? onLastMediaVisible
              : undefined}
            className={opacityForMediaId(photo.id)}
            thumbnailAspectRatio={16 / 9}
          />
          <div className={clsx(
            'flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-start lg:gap-x-1',
            opacityForMediaId(photo.id),
          )}>
            <div
              key={photo.id}
              className="min-w-0 flex flex-1 flex-col items-start gap-0.5"
            >
              <div className="flex min-w-0 items-center gap-1.5 self-stretch">
                <span className="min-w-0 flex-1">
                  <Link
                    href={pathForMedia({ photo })}
                    prefetch={false}
                    className={clsx(
                      'block truncate',
                      photo.hidden && 'text-dim',
                    )}
                  >
                    {titleForMedia(photo, false)?.toLocaleUpperCase()}
                  </Link>
                  {debugColorData && photo.colorData &&
                    <div>
                      <MediaColors colorData={photo.colorData} />
                    </div>}
                </span>
                {!doesMediaHaveDefaultVisibility(photo) &&
                  <span className={clsx(
                    'inline-flex shrink-0 items-center',
                    photo.hidden && 'text-dim',
                  )}>
                    <MediaVisibilityIcon photo={photo} />
                  </span>}
                {photoNeedsToBeUpdated(photo) &&
                  <span className="shrink-0">
                    <UpdateTooltip photo={photo} />
                  </span>}
                {showStatusLabel && statusLabel &&
                  <span className={clsx(
                    'shrink-0',
                    'px-[5px] py-[3px] sm:ml-[3px]',
                    'text-xs leading-none uppercase',
                    statusLabel === 'failed'
                      ? clsx(
                        'bg-red-100 text-red-700',
                        'dark:bg-red-950/50 dark:text-red-300',
                      )
                      : clsx(
                        'bg-blue-100 text-blue-700',
                        'dark:bg-blue-950/50 dark:text-blue-300',
                      ),
                    'rounded-sm',
                  )}>
                    {statusLabel}
                  </span>}
              </div>
            </div>
            <div className={clsx(
              'flex min-w-0 gap-1.5 w-full',
              'lg:w-auto lg:max-w-[30%] lg:shrink-0 uppercase',
              'text-dim',
            )}>
              <MediaDate
                {...{ photo, dateType, timezone }}
                className="truncate"
              />
            </div>
          </div>
          <div className={clsx(
            'flex shrink-0 flex-nowrap',
            'gap-2 items-center',
          )}>
            {canEdit &&
              <EditButton path={pathForAdminMediaEdit(photo)} />}
            <MediaSyncButton
              photo={photo}
              onSyncComplete={invalidateSwr}
              isSyncingExternal={photoIdsSyncing.includes(photo.id)}
              hasAiTextGeneration={hasAiTextGeneration}
              disabled={photoIdsSyncing.length > 0}
              className={opacityForMediaId(photo.id)}
              shouldConfirm
              shouldToast
              shouldScrollIntoViewOnExternalSync={
                shouldScrollIntoViewOnExternalSync}
              updateMode={updateMode}
            />
            {debugColorData &&
              <SyncColorButton photoId={photo.id} />}
            {canDelete &&
              <DeleteMediaButton
                photo={photo}
                onDelete={() => revalidateMedia?.(photo.id, true)}
              />}
          </div>
        </Fragment>;
      })}
    </AdminTable>
  );
}
