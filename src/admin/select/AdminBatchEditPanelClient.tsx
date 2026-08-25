'use client';

import Note from '@/components/Note';
import LoaderButton from '@/components/primitives/LoaderButton';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import AppGrid from '@/components/AppGrid';
import { clsx } from 'clsx/lite';
import { IoCloseSharp } from 'react-icons/io5';
import { useEffect, useRef, useState } from 'react';
import { TAG_FAVS, Tags } from '@/tag';
import { addMediaToSetAction, tagMultipleMediaAction } from '@/media/actions';
import { toastSuccess } from '@/toast';
import DeleteMediaButton from '@/admin/DeleteMediaButtonGroup';
import { photoQuantityText } from '@/media';
import { FaArrowDown, FaCheck, FaCheckDouble, FaLayerGroup } from 'react-icons/fa6';
import ResponsiveText from '@/components/primitives/ResponsiveText';
import IconFavs from '@/components/icons/IconFavs';
import { useAppText } from '@/i18n/state/client';
import { useSelectMediaState } from './SelectMediaState';
import { Albums } from '@/album';
import FieldsetAlbum from '@/album/FieldsetAlbum';
import IconAlbum from '@/components/icons/IconAlbum';
import { addMediaToAlbumsAction } from '@/album/actions';
import type { AdminBatchSetType } from './types';
import type { AnnotatedTag } from '@/media/form';
import type { Cameras } from '@/camera';
import { formatCameraText } from '@/camera';
import type { Lenses } from '@/lens';
import { formatLensText } from '@/lens';
import type { Recipes } from '@/recipe';
import type { Films } from '@/film';
import type { FocalLengths } from '@/focal';
import { formatFocalLength } from '@/focal';

export default function AdminBatchEditPanelClient({
  uniqueAlbums,
  uniqueTags,
  uniqueCategories,
  uniqueStudios,
  uniquePerformers,
  uniqueContentTypes,
  uniqueRecipes,
  uniqueFilms,
  uniqueCameras,
  uniqueLenses,
  uniqueFocalLengths,
}: {
  uniqueAlbums: Albums
  uniqueTags: Tags
  uniqueCategories: { category: string, count: number, lastModified: Date }[]
  uniqueStudios: string[]
  uniquePerformers: string[]
  uniqueContentTypes: string[]
  uniqueRecipes: Recipes
  uniqueFilms: Films
  uniqueCameras: Cameras
  uniqueLenses: Lenses
  uniqueFocalLengths: FocalLengths
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

  const [batchSetType, setBatchSetType] = useState<AdminBatchSetType>();
  const [batchSetValue, setBatchSetValue] = useState('');
  const isInBatchSetMode = batchSetType !== undefined;
  const [tagErrorMessage, setTagErrorMessage] = useState('');

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

  const batchSetTypeOptions = [
    { value: 'category', label: 'Categories' },
    { value: 'studio', label: 'Studio' },
    { value: 'performer', label: 'Performers' },
    { value: 'contentType', label: 'Content types' },
    { value: 'tag', label: 'Tags' },
    { value: 'recipe', label: 'Recipes' },
    { value: 'film', label: 'Films' },
    { value: 'camera', label: 'Cameras' },
    { value: 'lens', label: 'Lenses' },
    { value: 'focalLength', label: 'Focal lengths' },
  ];

  const batchSetLabel = batchSetTypeOptions.find(option =>
    option.value === batchSetType)?.label ?? 'Set';

  const batchSetTagOptions: AnnotatedTag[] = (() => {
    switch (batchSetType) {
      case 'tag':
        return uniqueTags.map(({ tag }) => ({ value: tag, label: tag }));
      case 'category':
        return uniqueCategories.map(({ category }) => ({
          value: category,
          label: category,
        }));
      case 'studio':
        return uniqueStudios.map(value => ({ value, label: value }));
      case 'performer':
        return uniquePerformers.map(value => ({ value, label: value }));
      case 'contentType':
        return uniqueContentTypes.map(value => ({ value, label: value }));
      case 'recipe':
        return uniqueRecipes.map(({ recipe }) => ({
          value: recipe,
          label: recipe,
        }));
      case 'film':
        return uniqueFilms.map(({ film }) => ({ value: film, label: film }));
      case 'camera':
        return uniqueCameras.map(({ camera }) => ({
          value: encodeURIComponent(JSON.stringify(camera)),
          label: formatCameraText(camera, 'long'),
        }));
      case 'lens':
        return uniqueLenses.map(({ lens }) => ({
          value: encodeURIComponent(JSON.stringify(lens)),
          label: formatLensText(lens, 'long'),
        }));
      case 'focalLength':
        return uniqueFocalLengths.map(({ focal }) => ({
          value: String(focal),
          label: formatFocalLength(focal),
        }));
      default:
        return [];
    }
  })();

  const batchSetLimit = batchSetType === 'studio' ||
    batchSetType === 'camera' ||
    batchSetType === 'lens' ||
    batchSetType === 'focalLength' ? 1 : undefined;

  const renderActions = isInBatchSetMode || isInAlbumMode
    ? <>
      <LoaderButton
        className="min-h-[2.5rem]"
        icon={<IoCloseSharp
          size={19}
          className="translate-y-[0.5px]"
        />}
        onClick={() => {
          setAlbumsTitles(undefined);
          setBatchSetType(undefined);
          setBatchSetValue('');
          setTagErrorMessage('');
        }}
        disabled={isPerformingSelectEdit}
      />
      <LoaderButton
        className="min-h-[2.5rem]"
        icon={<FaCheck size={15} />}
        confirmText={isInBatchSetMode
          ? `Are you sure you want to set ${batchSetLabel.toLowerCase()} on ${photosText}? This action cannot be undone.`
          : `Are you sure you want to add ${photosText} to these albums? This action cannot be undone.`}
        onClick={() => {
          setIsPerformingSelectEdit?.(true);
          if (isInBatchSetMode) {
            addMediaToSetAction(
              batchSetType,
              batchSetValue,
              selectedMediaIds ?? [],
            )
              .then(() => {
                toastSuccess(`${photosText} updated`);
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
          (!batchSetValue || Boolean(tagErrorMessage)) && !albumTitles ||
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
        onClick={() => {
          setBatchSetType('category');
          setBatchSetValue('');
          setTagErrorMessage('');
        }}
        disabled={isFormDisabled}
        icon={<FaLayerGroup size={15} className="translate-y-[1px]" />}
      >
        Add to
      </LoaderButton>
      <LoaderButton
        icon={<IoCloseSharp size={19} />}
        onClick={stopSelectingMedia}
      />
    </>;

  const shouldShowPanel =
    isSelectingMedia &&
    (canCurrentPageSelectMedia || hasSelectableMedia);

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
        'relative z-10 mb-3 pointer-events-auto',
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
          padding={isInBatchSetMode ? 'tight-cta-right-left' : 'tight-cta-right'}
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
            : isInBatchSetMode
              ? <div className="grid gap-2 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(12rem,1.3fr)]">
                <FieldsetWithStatus
                  label="Type"
                  value={batchSetType}
                  selectOptions={batchSetTypeOptions}
                  onChange={value => {
                    setBatchSetType(value as AdminBatchSetType);
                    setBatchSetValue('');
                    setTagErrorMessage('');
                  }}
                  hideLabel
                  readOnly={isPerformingSelectEdit}
                />
                <FieldsetWithStatus
                  label={batchSetLabel}
                  value={batchSetValue}
                  tagOptions={batchSetTagOptions}
                  tagOptionsLimit={batchSetLimit}
                  tagOptionsAllowNewValues
                  placeholder={`Choose ${batchSetLabel.toLowerCase()} ...`}
                  onChange={setBatchSetValue}
                  readOnly={isPerformingSelectEdit}
                  hideLabel
                />
              </div>
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
