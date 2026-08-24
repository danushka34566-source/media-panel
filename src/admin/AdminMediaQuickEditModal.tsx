'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';
import { useAppState } from '@/app/AppState';
import { Media } from '@/media';
import {
  getMediaQuickEditDataAction,
} from '@/media/actions';
import { convertMediaToFormData } from '@/media/form';
import MediaForm from '@/media/form/MediaForm';
import { toastSuccess } from '@/toast';

type QuickEditData = Awaited<
  ReturnType<typeof getMediaQuickEditDataAction>
>;

export default function AdminMediaQuickEditModal({
  photo,
  onClose,
  onUpdated,
}: {
  photo: Media
  onClose: () => void
  onUpdated?: () => void
}) {
  const router = useRouter();
  const { registerAdminUpdate } = useAppState();
  const [data, setData] = useState<QuickEditData>();
  const [isPending, setIsPending] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const loadData = useCallback(async () => {
    try {
      setData(await getMediaQuickEditDataAction(photo.id));
    } catch (error) {
      console.error(error);
      setLoadError('Unable to load all media details.');
    }
  }, [photo.id]);

  useEffect(() => {
    let cancelled = false;
    void getMediaQuickEditDataAction(photo.id)
      .then(result => {
        if (!cancelled) { setData(result); }
      })
      .catch(error => {
        console.error(error);
        if (!cancelled) { setLoadError('Unable to load media details.'); }
      });
    return () => { cancelled = true; };
  }, [photo.id]);

  return (
    <Modal
      onClose={() => {
        if (!isPending) { onClose(); }
      }}
      anchor="top"
      className="max-h-[calc(100dvh-1rem)]! w-[calc(100vw-1rem)]!
        overflow-y-auto sm:w-[min(720px,94vw)]!"
      noPadding
    >
      <div className="p-4 sm:p-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold">Quick Edit</h2>
          <p className="text-sm text-dim">
            Update the media details without leaving this page.
          </p>
        </div>
        {!data && !loadError && (
          <div className="flex min-h-48 items-center justify-center gap-2
            text-sm text-dim">
            <Spinner size={16} />
            Loading media details
          </div>
        )}
        {loadError && (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-error">{loadError}</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                setLoadError(undefined);
                void loadData();
              }}
            >
              Retry
            </button>
          </div>
        )}
        {data && (
          <MediaForm
            type="edit"
            inlineEdit
            compactEdit
            visibleSectionNames={['text']}
            initialMediaForm={convertMediaToFormData(photo)}
            photoAlbumTitles={data.photoAlbumTitles}
            albums={data.albums}
            uniqueTags={data.uniqueTags}
            uniqueCategories={data.uniqueCategories}
            uniqueStudios={data.uniqueStudios}
            uniquePerformers={data.uniquePerformers}
            uniqueContentTypes={data.uniqueContentTypes}
            excludeFields={['visibility']}
            onCancel={onClose}
            onFormStatusChange={setIsPending}
            onUpdated={() => {
              toastSuccess('Media updated');
              registerAdminUpdate?.();
              onUpdated?.();
              router.refresh();
              onClose();
            }}
          />
        )}
      </div>
    </Modal>
  );
}
