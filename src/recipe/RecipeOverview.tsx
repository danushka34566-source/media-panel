import { Media, MediaDateRangePostgres } from '@/media';
import MediaGridContainer from '@/media/MediaGridContainer';
import RecipeHeader from './RecipeHeader';

export default function RecipeOverview({
  recipe,
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  recipe: string,
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `recipe-${recipe}`,
      photos,
      count,
      recipe,
      header: <RecipeHeader {...{
        recipe,
        photos,
        count,
        dateRange,
      }} />,
      animateOnFirstLoadOnly,
    }} />
  );
}
