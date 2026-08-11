'use client';

import { Media, MediaDateRangePostgres } from '@/media';
import { descriptionForFilmMedia } from '.';
import MediaHeader from '@/media/MediaHeader';
import MediaFilm from '@/film/MediaFilm';
import { getRecipePropsFromMedia } from '@/recipe';
import { useAppState } from '@/app/AppState';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { useAppText } from '@/i18n/state/client';

export default function FilmHeader({
  film,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
}: {
  film: string
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
}) {
  const { recipeModalProps, setRecipeModalProps } = useAppState();

  // Only show recipe button when viewing individual photos
  // that don't have named recipes
  const recipeProps = selectedMedia && !selectedMedia?.recipeTitle
    ? getRecipePropsFromMedia(photos, selectedMedia)
    : undefined;

  const appText = useAppText();

  return (
    <MediaHeader
      film={film}
      entity={<MediaFilm
        film={film}
        isShowingRecipeOverlay={Boolean(recipeModalProps)}
        toggleRecipeOverlay={recipeProps
          ? () => setRecipeModalProps?.(recipeProps)
          : undefined}
        hoverType="none"
      />}
      entityDescription={descriptionForFilmMedia(
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
