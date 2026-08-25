'use client';

import Note from '@/components/Note';
import LoaderButton from '@/components/primitives/LoaderButton';
import AppGrid from '@/components/AppGrid';
import { clsx } from 'clsx/lite';
import { IoCloseSharp } from 'react-icons/io5';
import { useEffect, useRef, useState } from 'react';
import { TAG_FAVS, Tags } from '@/tag';
import FieldsetTag from '@/tag/FieldsetTag';
import { tagMultipleMediaAction } from '@/media/actions';
import { toastSuccess } from '@/toast';
import DeleteMediaButton from '@/admin/DeleteMediaButtonGroup';
import { photoQuantityText } from '@/media';
import { FaArrowDown, FaCheck, FaCheckDouble } from 'react-icons/fa6';
import ResponsiveText from '@/components/primitives/ResponsiveText';
import IconFavs from '@/components/icons/IconFavs';
import IconTag from '@/components/icons/IconTag';
import { useAppText } from '@/i18n/state/client';
import { useSelectMediaState } from './SelectMediaState';
import { Albums } from '@/album';
import FieldsetAlbum from '@/album/FieldsetAlbum';
import IconAlbum from '@/components/icons/IconAlbum';
import { addMediaToAlbumsAction } from '@/album/actions';

export default function AdminBatchEditPanelClient({
  uniqueAlbums,
  uniqueTags,
}: {
  uniqueAlbums: Albums
  uniqueTags: Tags
}) {
  const refNote = useRef<HTMLDivElement>(null);

  const {
    canCurrentPageSelectMedia,
    isSelectingMedia,
    stopSelectingMedia,
    selectedMediaIds,
    selectableMediaIds,
    selectAllMedia,
    clearSelectedMedia,
    isPerformingSelectEdit,
    setIsPerformingSelectEdit,
  } = useSelectMediaState();

  const appText = useAppText();

  const [albumTitles, setAlbumsTitles] = useState<string>();
  const isInAlbumMode = albumTitles !== undefined;

  const [tags, setTags] = useState<string>();
  const [tagErrorMessage, setTagErrorMessage] = useState('');
  const isInTagMode = tags !== undefined;

  const photosText = photoQuantityText(
    selectedMediaIds?.length ?? 0,
    appText,
    false,
    false,
  );

  const hasSelectableMedia = (selectableMediaIds?.length ?? 0) > 0;
  const areAllMediaSelected = hasSelectableMedia &&
    selectableMediaIds?.every(id => selectedMediaIds?.includes(id));

  const isFormDisabled =
    isPerformingSelectEdit ||
    selectedMediaIds?.length === 0;

  const renderMediaCTA = selectedMediaIds?.length === 0
    ? <>
      <FaArrowDown />
      <ResponsiveText shortText="Select">
        Select photos below
      </ResponsiveText>
    </>
    : <ResponsiveText shortText={photosText}>
      {photosText} selected
    </ResponsiveText>;

  const renderActions = isInTagMode || isInAlbumMode
    ? <>
      <LoaderButton
        className="min-h-[2.5rem]"
        icon={<IoCloseSharp
          size={19}
          className="translate-y-[0.5px]"
        />}
        onClick={() => {
          setAlbumsTitles(undefined);
          setTags(undefined);
          setTagErrorMessage('');
        }}
        disabled={isPerformingSelectEdit}
      />
      <LoaderButton
        className="min-h-[2.5rem]"
        icon={<FaCheck size={15} />}
        confirmText={isInTagMode
          // eslint-disable-next-line max-len
          ? `Are you sure you want to apply tags to ${photosText}? This action cannot be undone.`
          // eslint-disable-next-line max-len
          : `Are you sure you want to add ${photosText} to these albums? This action cannot be undone.`}
        onClick={() => {
          setIsPerformingSelectEdit?.(true);
          if (isInTagMode) {
            tagMultipleMediaAction(
              tags,
              selectedMediaIds ?? [],
            )
              .then(() => {
                toastSuccess(`${photosText} tagged`);
                stopSelectingMedia?.();
              })
              .finally(() => setIsPerformingSelectEdit?.(false));
          } else if (isInAlbumMode) {
            addMediaToAlbumsAction(
              selectedMediaIds ?? [],
              albumTitles.split(','),
            )
              .then(() => {
                toastSuccess(`${photosText} added`);
                stopSelectingMedia?.();
              })
              .finally(() => setIsPerformingSelectEdit?.(false));
          }
        }}
        disabled={
          (
            (!tags || Boolean(tagErrorMessage)) &&
            !albumTitles
          ) ||
          (selectedMediaIds?.length ?? 0) === 0 ||
          isPerformingSelectEdit
        }
        primary
      >
        Apply
      </LoaderButton>
    </>
    : <>
      <LoaderButton
        icon={<FaCheckDouble size={15} />}
        onClick={() => areAllMediaSelected
          ? clearSelectedMedia?.()
          : selectAllMedia?.()}
        disabled={isPerformingSelectEdit || !hasSelectableMedia}
      >
        {areAllMediaSelected ? 'Clear all' : 'Select all'}
      </LoaderButton>
      <DeleteMediaButton
        photoIds={selectedMediaIds}
        disabled={isFormDisabled}
        onClick={() => setIsPerformingSelectEdit?.(true)}
        onDelete={stopSelectingMedia}
        onFinish={() => setIsPerformingSelectEdit?.(false)}
      />
      <LoaderButton
        icon={<IconFavs />}
        disabled={isFormDisabled}
        confirmText={`Are you sure you want to favorite ${photosText}?`}
        onClick={() => {
          setIsPerformingSelectEdit?.(true);
          tagMultipleMediaAction(
            TAG_FAVS,
            selectedMediaIds ?? [],
          )
            .then(() => {
              toastSuccess(`${photosText} favorited`);
              stopSelectingMedia?.();
            })
            .finally(() => setIsPerformingSelectEdit?.(false));
        }}
      />
      <LoaderButton
        onClick={() => setAlbumsTitles('')}
        disabled={isFormDisabled}
        icon={<IconAlbum size={15} className="translate-y-[1.5px]" />}
      >
        Album
      </LoaderButton>
      <LoaderButton
        onClick={() => setTags('')}
        disabled={isFormDisabled}
        icon={<IconTag size={15} className="translate-y-[1.5px]" />}
      >
        Tag
      </LoaderButton>
      <LoaderButton
        icon={<IoCloseSharp size={19} />}
        onClick={stopSelectingMedia}
      />
    </>;

  const shouldShowPanel =
    isSelectingMedia &&
    canCurrentPageSelectMedia;

  useEffect(() => {
    // Steal focus from Admin Menu to hide tooltip
    if (isSelectingMedia) {
      refNote.current?.focus();
    }
  }, [isSelectingMedia]);

  return shouldShowPanel
    ? <AppGrid
      className={clsx(
        // Keep the toolbox in normal page flow below the header. It should
        // never cover media, the header, or the visible edge of a sidebar.
        'relative z-20 mb-3 pointer-events-auto',
      )}
      classNameMain="md:col-span-12"
      contentMain={<div className="flex flex-col gap-2">
        <Note
          ref={refNote}
          color="gray"
          className={clsx(
            'min-h-[3.5rem] pr-2',
            'backdrop-blur-lg border-transparent!',
            'text-gray-900! dark:text-gray-100!',
            'bg-gray-100/90! dark:bg-gray-900/70!',
            // Override default <Note /> content spacing
            '[&>*>*:first-child]:gap-1.5 sm:[&>*>*:first-child]:gap-2.5',
          )}
          padding={isInTagMode ? 'tight-cta-right-left' : 'tight-cta-right'}
          cta={<div className="flex items-center gap-1.5 sm:gap-2.5">
            {renderActions}
          </div>}
          spaceChildren={false}
          hideIcon
        >
          {isInAlbumMode
            ? <FieldsetAlbum
              albumOptions={uniqueAlbums}
              value={albumTitles}
              onChange={setAlbumsTitles}
              readOnly={isPerformingSelectEdit}
              openOnLoad
              hideLabel
            />
            : isInTagMode
              ? <FieldsetTag
                tags={tags}
                tagOptions={uniqueTags}
                placeholder={`Tag ${photosText} ...`}
                onChange={setTags}
                onError={setTagErrorMessage}
                readOnly={isPerformingSelectEdit}
                openOnLoad
                hideLabel
              />
              : <div className="text-base flex gap-2 items-center">
                {renderMediaCTA}
              </div>}
        </Note>
        {tagErrorMessage &&
          <div className="text-error pl-4">
            {tagErrorMessage}
          </div>}
      </div>} />
    : null;
}
