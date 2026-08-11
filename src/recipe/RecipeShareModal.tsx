import { absolutePathForRecipe } from '@/app/path';
import { MediaSetAttributes } from '../category';
import ShareModal from '@/share/ShareModal';
import {
  formatRecipe,
  shareTextForRecipe,
  getRecipePropsFromMedia,
  generateRecipeText,
} from '.';
import RecipeOGTile from './RecipeOGTile';
import { useAppText } from '@/i18n/state/client';

export default function RecipeShareModal({
  recipe,
  photos,
  count,
  dateRange,
}: {
  recipe: string
} & MediaSetAttributes) {
  // Omit title from RecipeProps
  const { data, film } = getRecipePropsFromMedia(photos) ?? {};
  const recipeText = data && film
    ? generateRecipeText({ data, film })
    : undefined;

  const appText = useAppText();

  return (
    <ShareModal
      pathShare={absolutePathForRecipe(recipe, true)}
      socialText={shareTextForRecipe(recipe, appText)}
      navigatorTitle={formatRecipe(recipe)}
      navigatorText={recipeText}
    >
      <RecipeOGTile {...{ recipe, photos, count, dateRange }} />
    </ShareModal>
  );
};
