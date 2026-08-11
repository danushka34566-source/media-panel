'use client';

import AdminChildPage from '@/components/AdminChildPage';
import { PATH_ADMIN_UPLOADS } from '@/app/path';
import {
  MediaFormData,
  generateTakenAtFields,
} from './form';
import MediaForm from './form/MediaForm';
import { Tags } from '@/tag';
import useMediaFormParent from './form/useMediaFormParent';
import AiButton from './ai/AiButton';
import { useMemo } from 'react';
import { Recipes } from '@/recipe';
import { Films } from '@/film';
import { Albums } from '@/album';

export default function UploadPageClient({
  blobId,
  formDataFromExif,
  albums,
  uniqueTags,
  uniqueCategories,
  uniqueRecipes,
  uniqueFilms,
  hasAiTextGeneration,
  imageThumbnailBase64,
  shouldStripGpsData,
}: {
  blobId?: string
  formDataFromExif: Partial<MediaFormData>
  albums: Albums
  uniqueTags: Tags
  uniqueCategories: { category: string, count: number, lastModified: Date }[]
  uniqueRecipes: Recipes
  uniqueFilms: Films
  hasAiTextGeneration?: boolean
  imageThumbnailBase64?: string
  shouldStripGpsData?: boolean
}) {
  const {
    pending,
    setIsPending,
    updatedTitle,
    setUpdatedTitle,
    shouldConfirmAiTextGeneration,
    setShouldConfirmAiTextGeneration,
    aiContent,
  } = useMediaFormParent({
    photoForm: formDataFromExif,
    imageThumbnailBase64,
  });

  const initialMediaForm = useMemo(() => ({
    ...formDataFromExif,
    // Generate missing dates on client to avoid timezone issues
    ...generateTakenAtFields(formDataFromExif),
  }), [formDataFromExif]);

  return (
    <AdminChildPage
      backPath={PATH_ADMIN_UPLOADS}
      backLabel="Uploads"
      breadcrumb={pending && updatedTitle
        ? updatedTitle
        : blobId}
      breadcrumbEllipsis
      accessory={hasAiTextGeneration &&
        <AiButton {...{
          aiContent,
          shouldConfirm: shouldConfirmAiTextGeneration,
          tooltip: 'Generate AI text for all fields',
        }} />}
      isLoading={pending}
    >
      <MediaForm
        initialMediaForm={initialMediaForm}
        albums={albums}
        uniqueTags={uniqueTags}
        uniqueCategories={uniqueCategories}
        uniqueRecipes={uniqueRecipes}
        uniqueFilms={uniqueFilms}
        aiContent={hasAiTextGeneration ? aiContent : undefined}
        shouldStripGpsData={shouldStripGpsData}
        onTitleChange={setUpdatedTitle}
        onFormStatusChange={setIsPending}
        onFormDataChange={setShouldConfirmAiTextGeneration}
      />
    </AdminChildPage>
  );
}
