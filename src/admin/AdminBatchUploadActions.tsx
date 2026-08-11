'use client';

import ErrorNote from '@/components/ErrorNote';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import Container from '@/components/Container';
import { addUploadsAction } from '@/media/actions';
import { PATH_ADMIN_MEDIA } from '@/app/path';
import { Tags } from '@/tag';
import {
  generateLocalNaivePostgresString,
  generateLocalPostgresString,
} from '@/utility/date';
import sleep from '@/utility/sleep';
import { readStreamableValue } from '@ai-sdk/rsc';
import { useRouter } from 'next/navigation';
import { Dispatch, SetStateAction, useRef, useState } from 'react';
import { BiCheckCircle } from 'react-icons/bi';
import ProgressButton from '@/components/primitives/ProgressButton';
import { UrlAddStatus } from './upload';
import FieldsetTag from '../tag/FieldsetTag';
import DeleteUploadButton from './DeleteUploadButton';
import { useAppState } from '@/app/AppState';
import { pluralize } from '@/utility/string';
import FieldsetFavs from '@/media/form/FieldsetFavs';
import IconAddUpload from '@/components/icons/IconAddUpload';
import { MediaFormData } from '@/media/form';
import FieldsetVisibility from '@/media/visibility/FieldsetVisibility';
import { Albums } from '@/album';
import FieldsetAlbum from '@/album/FieldsetAlbum';

// Process one upload per server action to reduce serverless timeouts on Vercel
const UPLOAD_BATCH_SIZE = 1;

export default function AdminBatchUploadActions({
  uploadUrls,
  uploadTitles,
  uploadOriginalFileNames,
  uniqueAlbums,
  uniqueTags,
  isAdding,
  setIsAdding,
  setUrlAddStatuses,
  isDeleting,
  setIsDeleting,
  onBatchActionComplete,
}: {
  uploadUrls: string[]
  uploadTitles: string[]
  uploadOriginalFileNames: (string | undefined)[]
  uniqueAlbums: Albums
  uniqueTags?: Tags
  isAdding: boolean
  setIsAdding: Dispatch<SetStateAction<boolean>>
  setUrlAddStatuses: Dispatch<SetStateAction<UrlAddStatus[]>>
  isDeleting: boolean
  setIsDeleting: Dispatch<SetStateAction<boolean>>
  onBatchActionComplete?: () => Promise<void>
}) {
  const { confirmDialog, updateAdminData, uploadState, setUploadState } =
    useAppState();

  const [showBulkSettings, setShowBulkSettings] = useState(false);
  const [tagErrorMessage, setTagErrorMessage] = useState('');
  const [formData, setFormData] = useState<Partial<MediaFormData>>({});
  const [albumTitles, setAlbumTitles] = useState<string>();

  const [buttonText, setButtonText] = useState('Add All Uploads');
  const [actionErrorMessage, setActionErrorMessage] = useState('');
  const [addingProgress, setAddingProgress] = useState<number>();
  const [isAddingComplete, setIsAddingComplete] = useState(false);

  const router = useRouter();

  const addedUploadCount = useRef(0);
  const addUploadUrls = async (
    urls: string[],
    titles: string[],
    originals: (string | undefined)[],
    isFinalBatch: boolean,
  ) => {
    const { tags, favorite, excludeFromFeeds, hidden } = formData;
    try {
      const metadataByUrl = uploadState.uploadMetadataByUrl ?? {};
      const stream = await addUploadsAction({
        uploadUrls: urls,
        uploadTitles: titles,
        uploadOriginalFileNames: originals,
        uploadOverwriteMediaIds: urls.map(url => metadataByUrl[url]?.overwriteMediaId),
        uploadOverwriteTargetUrls: urls.map(url => metadataByUrl[url]?.overwriteTargetUrls),
        uploadPreferredFileNameBases: urls.map(url => metadataByUrl[url]?.preferredFileNameBase),
        ...showBulkSettings && {
          albumTitles: albumTitles?.split(','),
          tags,
          favorite,
          excludeFromFeeds,
          hidden,
        },
        takenAtLocal: generateLocalPostgresString(),
        takenAtNaiveLocal: generateLocalNaivePostgresString(),
        shouldRevalidateAllKeysAndPaths: isFinalBatch,
      });
      for await (const data of readStreamableValue(stream)) {
        setButtonText(
          `Adding ${addedUploadCount.current + 1} of ${uploadUrls.length}`,
        );
        setUrlAddStatuses(current => {
          if (data?.status === 'added' && data.url) {
            const didRemove = current.some(status => status.url === data.url);
            if (didRemove) {
              addedUploadCount.current += 1;
            }
            return current.filter(status => status.url !== data.url);
          }

          const update = current.map(status =>
            status.url === data?.url
              ? {
                ...status,
                // Prevent status regressions
                status: status.status !== 'added' ? data.status : 'added',
                statusMessage: data.statusMessage,
                progress: data.progress,
              }
              : status,
          );
          addedUploadCount.current = update
            .filter(({ status }) => status === 'added')
            .length;
          return update;
        });
        if (data?.status === 'added' && setUploadState) {
          const metadata = uploadState.uploadMetadataByUrl ?? {};
          const remainingClientUploads = uploadState.clientUploads.filter(
            clientUpload => clientUpload.uploadedUrl !== data.url,
          );
          if (metadata[data.url]) {
            const { [data.url]: _removed, ...remaining } = metadata;
            setUploadState({
              clientUploads: remainingClientUploads,
              uploadMetadataByUrl: remaining,
              isUploading: remainingClientUploads.some(clientUpload =>
                clientUpload.status === 'queued' ||
                clientUpload.status === 'uploading'),
            });
          } else {
            setUploadState({
              clientUploads: remainingClientUploads,
              isUploading: remainingClientUploads.some(clientUpload =>
                clientUpload.status === 'queued' ||
                clientUpload.status === 'uploading'),
            });
          }
        }
        setAddingProgress((current = 0) => {
          const updatedProgress = (
            (
              ((addedUploadCount.current || 1) - 1) +
              (data?.progress ?? 0)
            ) /
            uploadUrls.length
          ) * 0.95;
          // Prevent out-of-order updates causing progress to go backwards
          return Math.max(current, updatedProgress);
        });
      }
    } catch (e: any) {
      setIsAdding(false);
      setButtonText('Try Again');
      setAddingProgress(undefined);
      setActionErrorMessage(e);
    }
  };

  return (
    <>
      {actionErrorMessage &&
        <ErrorNote>{actionErrorMessage}</ErrorNote>}
      <Container padding="tight" className="p-2! sm:p-3! relative z-10">
        <div className="w-full space-y-4">
          <div className="flex">
            <div className="grow text-main">
              {showBulkSettings
                ? `Apply to ${pluralize(uploadUrls.length, 'upload')}`
                : `Found ${pluralize(uploadUrls.length, 'upload')}`}
            </div>
            <FieldsetWithStatus
              label="Apply to All"
              type="checkbox"
              value={showBulkSettings ? 'true' : 'false'}
              onChange={value => setShowBulkSettings(value === 'true')}
              readOnly={isAdding}
            />
          </div>
          {showBulkSettings && !actionErrorMessage &&
            <div className="space-y-4 mb-6">
              <FieldsetAlbum
                albumOptions={uniqueAlbums}
                value={albumTitles ?? ''}
                onChange={albums => setAlbumTitles(albums)}
                readOnly={isAdding}
                className="relative z-11"
              />
              <FieldsetTag
                label="Tags"
                tags={formData.tags ?? ''}
                tagOptions={uniqueTags}
                onChange={tags => setFormData(data => ({ ...data, tags }))}
                onError={setTagErrorMessage}
                readOnly={isAdding}
                className="relative z-10"
              />
              <FieldsetVisibility
                formData={formData}
                setFormData={setFormData}
                readOnly={isAdding}
              />
              <FieldsetFavs
                className="pt-2.5 pb-2"
                value={formData.favorite ?? 'false'}
                onChange={favorite =>
                  setFormData(data => ({ ...data, favorite }))}
                readOnly={isAdding}
              />
            </div>}
          <div className="flex flex-col sm:flex-row-reverse gap-2">
            <ProgressButton
              primary
              className="w-full justify-center"
              progress={addingProgress}
              isLoading={isAdding}
              disabled={
                Boolean(tagErrorMessage) ||
                isAddingComplete ||
                isDeleting
              }
              icon={isAddingComplete
                ? <BiCheckCircle size={18} className="translate-x-[1px]" />
                : <IconAddUpload />
              }
              onClick={async () => {
                const didConfirm = await confirmDialog?.({
                  title: 'Add Uploads',
                  description:
                    `Are you sure you want to add all ${uploadUrls.length} uploads?`,
                  confirmLabel: 'Add Uploads',
                });
                if (!didConfirm) { return; }

                setIsAdding(true);
                setUrlAddStatuses(current => current.map((url, index) => ({
                  ...url,
                  status: index === 0 ? 'adding' : 'waiting',
                })));
                const uploadsToAdd = uploadUrls.slice();
                const titlesToAdd = uploadTitles.slice();
                try {
                  const originalsToAdd =
                    uploadOriginalFileNames
                      ? [...uploadOriginalFileNames]
                      : [];
                  while (uploadsToAdd.length > 0) {
                    const nextBatch = uploadsToAdd
                      .splice(0, UPLOAD_BATCH_SIZE);
                    const nextTitles = titlesToAdd
                      .splice(0, UPLOAD_BATCH_SIZE);
                    const nextOriginals = originalsToAdd
                      .splice(0, UPLOAD_BATCH_SIZE);
                    await addUploadUrls(
                      nextBatch,
                      nextTitles,
                      nextOriginals,
                      uploadsToAdd.length === 0,
                    );
                    // Brief pause between server actions to reduce 500s under load
                    await sleep(250);
                  }
                  setButtonText('Complete');
                  setAddingProgress(1);
                  setIsAdding(false);
                  setIsAddingComplete(true);
                  if (setUploadState) {
                    setUploadState({ uploadMetadataByUrl: {} });
                  }
                  await onBatchActionComplete?.();
                  await sleep(1000).then(() =>
                    router.push(PATH_ADMIN_MEDIA));
                } catch (e: any) {
                  setAddingProgress(undefined);
                  setIsAdding(false);
                  setButtonText('Try Again');
                  setActionErrorMessage(e);
                }
              }}
              hideText="never"
            >
              {buttonText}
            </ProgressButton>
            <DeleteUploadButton
              urls={uploadUrls}
              onDeleteStart={() => setIsDeleting(true)}
              onDelete={async didFail => {
                if (!didFail) {
                  updateAdminData?.({ uploadsCount: 0 });
                  await onBatchActionComplete?.();
                  router.push(PATH_ADMIN_MEDIA);
                } else {
                  setIsDeleting(false);
                }
              }}
              className="w-full flex justify-center"
              shouldRedirectToAdminMedia
              hideText="never"
              disabled={isAdding}
            >
              Delete All Uploads
            </DeleteUploadButton>
          </div>
        </div>
      </Container>
    </>
  );
}
