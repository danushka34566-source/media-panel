'use client';

import AdminChildPage from '@/components/AdminChildPage';
import { Media } from '.';
import { PATH_ADMIN_MEDIA } from '@/app/path';
import {
  MediaFormData,
  convertMediaToFormData,
} from './form';
import MediaForm from './form/MediaForm';
import { Tags } from '@/tag';
import AiButton from './ai/AiButton';
import useMediaFormParent from './form/useMediaFormParent';
import ExifCaptureButton from '@/admin/ExifCaptureButton';
import { useCallback, useEffect, useState } from 'react';
import { Recipes } from '@/recipe';
import { Films } from '@/film';
import { StorageListResponse } from '@/platforms/storage';
import { Albums } from '@/album';
import { useAppText } from '@/i18n/state/client';
import { isVideoMedia } from '.';
import { getStorageUrlsForMediaAction } from './actions';

export default function MediaEditPageClient({
  photo,
  photoAlbumTitles,
  albums,
  uniqueTags,
  uniqueCategories,
  uniqueStudios,
  uniquePerformers,
  uniqueContentTypes,
  uniqueRecipes,
  uniqueFilms,
  hasAiTextGeneration,
  imageThumbnailBase64,
}: {
  photo: Media
  photoAlbumTitles: string[]
  albums: Albums
  uniqueTags: Tags
  uniqueCategories: { category: string, count: number, lastModified: Date }[]
  uniqueStudios: string[]
  uniquePerformers: string[]
  uniqueContentTypes: string[]
  uniqueRecipes: Recipes
  uniqueFilms: Films
  hasAiTextGeneration: boolean
  imageThumbnailBase64: string
}) {
  const photoForm = convertMediaToFormData(photo);
  const appText = useAppText();
  const isVideo = isVideoMedia(photo);
  const [photoStorageUrls, setPhotoStorageUrls] = useState<StorageListResponse>();
  const refreshStorageUrls = useCallback(() =>
    getStorageUrlsForMediaAction(photo.id)
      .then(urls => setPhotoStorageUrls(urls))
      .catch(() => setPhotoStorageUrls(undefined)),
  [photo.id]);

  const {
    pending,
    setIsPending,
    updatedTitle,
    setUpdatedTitle,
    shouldConfirmAiTextGeneration,
    setShouldConfirmAiTextGeneration,
    aiContent,
  } = useMediaFormParent({
    photoForm,
    imageThumbnailBase64,
  });

  const [updatedExifData, setUpdatedExifData] =
    useState<Partial<MediaFormData>>();

  useEffect(() => {
    refreshStorageUrls().catch(() => undefined);
    if (!isVideo) { return; }
    const interval = window.setInterval(() => {
      refreshStorageUrls().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isVideo, refreshStorageUrls]);

  return (
    <AdminChildPage
      backPath={PATH_ADMIN_MEDIA}
      backLabel={isVideo ? 'Library' : appText.photo.photoPlural}
      breadcrumb={pending && updatedTitle
        ? updatedTitle
        : photo.title || photo.id}
      breadcrumbEllipsis
      accessory={
        <div className="flex gap-2">
          {hasAiTextGeneration &&
            <AiButton {...{
              aiContent,
              shouldConfirm: shouldConfirmAiTextGeneration,
              tooltip: 'Generate AI text for all fields',
            }} />}
          {!isVideo &&
            <ExifCaptureButton
              photoUrl={photo.url}
              onSync={setUpdatedExifData}
            />}
        </div>}
      isLoading={pending}
    >
      <MediaForm
        type="edit"
        initialMediaForm={photoForm}
        photoStorageUrls={photoStorageUrls}
        onStorageFilesChanged={refreshStorageUrls}
        updatedExifData={updatedExifData}
        photoAlbumTitles={photoAlbumTitles}
        albums={albums}
        uniqueTags={uniqueTags}
        uniqueCategories={uniqueCategories}
        uniqueStudios={uniqueStudios}
        uniquePerformers={uniquePerformers}
        uniqueContentTypes={uniqueContentTypes}
        uniqueRecipes={uniqueRecipes}
        uniqueFilms={uniqueFilms}
        aiContent={hasAiTextGeneration ? aiContent : undefined}
        onTitleChange={setUpdatedTitle}
        onFormStatusChange={setIsPending}
        onFormDataChange={setShouldConfirmAiTextGeneration}
      />
    </AdminChildPage>
  );
};
