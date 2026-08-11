import { Media, MediaDateRangePostgres } from '@/media';
import { pathForRecipe, pathForRecipeImage } from '@/app/path';
import OGTile, { OGTilePropsCore } from '@/components/og/OGTile';
import { descriptionForRecipeMedia, titleForRecipe } from '.';
import { useAppText } from '@/i18n/state/client';

export default function RecipeOGTile({
  recipe,
  photos,
  count,
  dateRange,
  ...props
}: {
  recipe: string
  photos: Media[]
  count?: number
  dateRange?: MediaDateRangePostgres
} & OGTilePropsCore) {
  const appText = useAppText();
  return (
    <OGTile {...{
      ...props,
      title: titleForRecipe(recipe, photos, appText, count),
      description: descriptionForRecipeMedia(
        photos,
        appText,
        true,
        count,
        dateRange,
      ),
      path: pathForRecipe(recipe),
      pathImage: pathForRecipeImage(recipe),
    }}/>
  );
};
