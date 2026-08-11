'use client';

import { Media } from '@/media';
import AdminMediaTable from '@/admin/AdminMediaTable';
import Note from '@/components/Note';
import AdminChildPage from '@/components/AdminChildPage';
import { PATH_ADMIN_MEDIA } from '@/app/path';
import { useEffect, useRef, useState } from 'react';
import { syncMediaItemsAction } from '@/media/actions';
import { useRouter } from 'next/navigation';
import ResponsiveText from '@/components/primitives/ResponsiveText';
import { LiaBroomSolid } from 'react-icons/lia';
import ProgressButton from '@/components/primitives/ProgressButton';
import ErrorNote from '@/components/ErrorNote';
import {
  getMediaBatchUpdateStatusText,
  isMediaOnlyMissingColorData,
} from '@/media/update';
import IconBroom from '@/components/icons/IconBroom';
import { useAppText } from '@/i18n/state/client';
import { useAppState } from '@/app/AppState';

const SYNC_BATCH_SIZE_MAX = 3;

export default function AdminMediaUpdateClient({
  photos,
  hasAiTextGeneration,
}: {
  photos: Media[]
  hasAiTextGeneration: boolean
}) {
  // Use refs for non-reactive while loop state
  const photoIdsToSync = useRef(photos.map(photo => photo.id));
  const errorRef = useRef<Error>(undefined);

  // Use state for updating progress button and error UI
  const [updateCount, setUpdateCount] = useState(photos.length);
  const [statusText, setStatusText] =
    useState(getMediaBatchUpdateStatusText(photos));
  const [photoIdsSyncing, setMediaIdsSyncing] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error>();

  const areMediaIdsSyncing = photoIdsSyncing.length > 0;

  const router = useRouter();
  const appText = useAppText();
  const { confirmDialog } = useAppState();

  useEffect(() => {
    if (photos.length === 0 && !error && !errorRef.current) {
      router.push(PATH_ADMIN_MEDIA);
    }
  }, [photos.length, router, error]);

  return (
    <AdminChildPage
      backLabel={appText.photo.photoPlural}
      backPath={PATH_ADMIN_MEDIA}
      breadcrumb={<ResponsiveText shortText="Updates">
        Updates ({updateCount})
      </ResponsiveText>}
      accessory={<ProgressButton
        primary
        icon={<IconBroom size={18} />}
        hideText="never"
        progress={progress}
        tooltip={updateCount === 1
          ? `Update 1 ${appText.photo.photo.toLowerCase()}`
          : `Update all ${updateCount} ${appText.photo.photoPlural.toLowerCase()}`}
        onClick={async () => {
          const didConfirm = await confirmDialog?.({
            title: 'Sync Media',
            description: [
              'Are you sure you want to sync',
              updateCount === 1
                ? `1 ${appText.photo.photo.toLowerCase()}?`
                : `all ${updateCount} ${appText.photo.photoPlural.toLowerCase()}?`,
              'Browser must remain open while syncing.',
              'This action cannot be undone.',
            ].join(' '),
            confirmLabel: 'Sync Media',
            tone: 'danger',
          });
          if (!didConfirm) { return; }

          errorRef.current = undefined;
          setError(undefined);
          while (photoIdsToSync.current.length > 0) {
            const photoIds = photoIdsToSync.current
              .slice(0, SYNC_BATCH_SIZE_MAX);
            setMediaIdsSyncing(photoIds);
            await syncMediaItemsAction(photoIds.map(id => ({
              photoId: id,
              onlySyncColorData: isMediaOnlyMissingColorData(
                photos.find(photo => photo.id === id),
              ),
            })))
              .then(() => {
                photoIdsToSync.current = photoIdsToSync.current.filter(
                  id => !photoIds.includes(id),
                );
                const photosRemaining = photos
                  .filter(({ id }) => photoIdsToSync.current.includes(id));
                setStatusText(getMediaBatchUpdateStatusText(photosRemaining));
                setUpdateCount(photosRemaining.length);
                setProgress(
                  (photos.length - photoIdsToSync.current.length) /
                  photos.length,
                );
                router.refresh();
              })
              .catch(e => {
                errorRef.current = e;
                setError(e);
              });
            if (errorRef.current) { break; }
          }
          setProgress(0);
          setMediaIdsSyncing([]);
          router.refresh();
        }}
        isLoading={areMediaIdsSyncing}
        disabled={photoIdsSyncing.length > 0}
      >
        {areMediaIdsSyncing
          ? 'Updating ...'
          : 'Update All'}
      </ProgressButton>}
    >
      <div className="space-y-6">
        {error && <ErrorNote>
          <span className="font-bold">
            Issue syncing:
          </span>
          {' '}
          {error.message}
        </ErrorNote>}
        <Note
          color="blue"
          icon={<LiaBroomSolid size={18}/>}
        >
          <div className="space-y-1.5">
            <div className="font-bold">
              {areMediaIdsSyncing
                ? <>Updating photos: {statusText}</>
                : <>Media updates: {statusText}</>}
            </div>
            {areMediaIdsSyncing
              ? <>Leave browser open until updates complete</>
              : <>
                Sync to capture new EXIF fields, optimize image data,
                {' '}
                use AI to generate missing text (if configured)
              </>}
          </div>
        </Note>
        <div className="space-y-4">
          <AdminMediaTable
            photos={photos}
            photoIdsSyncing={photoIdsSyncing}
            hasAiTextGeneration={hasAiTextGeneration}
            canEdit={false}
            canDelete={false}
            dateType="updatedAt"
            shouldScrollIntoViewOnExternalSync
            updateMode
          />
        </div>
      </div>
    </AdminChildPage>
  );
}
