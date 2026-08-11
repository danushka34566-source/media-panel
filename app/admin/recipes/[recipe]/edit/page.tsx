import AdminChildPage from '@/components/AdminChildPage';
import { redirect } from 'next/navigation';
import { getMediaCached, getMediaMetaCached } from '@/media/cache';
import { PATH_ADMIN, PATH_ADMIN_RECIPES, pathForRecipe } from '@/app/path';
import MediaLightbox from '@/media/MediaLightbox';
import AdminRecipeBadge from '@/admin/AdminRecipeBadge';
import AdminRecipeForm from '@/admin/AdminRecipeForm';
import { getRecipePropsFromMedia } from '@/recipe';
import AdminShowRecipeButton from '@/admin/AdminShowRecipeButton';

const MAX_MEDIA_TO_SHOW = 6;

interface Props {
  params: Promise<{ recipe: string }>
}

export default async function RecipePageEdit({
  params,
}: Props) {
  const { recipe: recipeFromParams } = await params;

  const recipe = decodeURIComponent(recipeFromParams);
  
  const [
    { count },
    photos,
  ] = await Promise.all([
    getMediaMetaCached({ recipe }),
    getMediaCached({ recipe, limit: MAX_MEDIA_TO_SHOW }),
  ]);

  const { data, film } = getRecipePropsFromMedia(photos) ?? {};

  if (count === 0) { redirect(PATH_ADMIN); }

  return (
    <AdminChildPage
      backPath={PATH_ADMIN_RECIPES}
      backLabel="Recipes"
      breadcrumb={<AdminRecipeBadge {...{ recipe, count, hideBadge: true }} />}
      accessory={data && film &&
        <AdminShowRecipeButton
          title={recipe}
          data={data}
          film={film}
        />
      }
    >
      <AdminRecipeForm {...{ recipe }}>
        <MediaLightbox
          {...{ count, photos, recipe }}
          maxMediaToShow={MAX_MEDIA_TO_SHOW}
          moreLink={pathForRecipe(recipe)}
        />
      </AdminRecipeForm>
    </AdminChildPage>
  );
};
