'use client';

import { Media, MediaDateRangePostgres } from '@/media';
import MediaHeader from '@/media/MediaHeader';
import MediaRecipe from './MediaRecipe';
import { useAppState } from '@/app/AppState';
import { descriptionForRecipeMedia, getRecipePropsFromMedia } from '.';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { useAppText } from '@/i18n/state/client';

export default function RecipeHeader({
  recipe,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  recipe: string
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const { recipeModalProps, setRecipeModalProps } = useAppState();

  const appText = useAppText();

  const recipeProps = getRecipePropsFromMedia(photos, selectedMedia);

  return (
    <MediaHeader
      recipe={recipe}
      entity={<MediaRecipe
        recipe={recipe}
        contrast="high"
        hoverType="none"
        isShowingRecipeOverlay={Boolean(recipeModalProps)}
        toggleRecipeOverlay={recipeProps
          ? () => setRecipeModalProps?.(recipeProps)
          : undefined}
      />}
      entityDescription={descriptionForRecipeMedia(
        photos,
        appText,
        undefined,
        count,
        dateRange,
      )}
      photos={photos}
      selectedMedia={selectedMedia}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      hasAiTextGeneration={AI_CONTENT_GENERATION_ENABLED}
      includeShareButton
    />
  );
}
