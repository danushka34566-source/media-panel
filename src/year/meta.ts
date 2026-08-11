import { descriptionForMediaSet, Media, MediaDateRangePostgres } from '@/media';
import { AppTextState } from '@/i18n/state';
import { absolutePathForYear, absolutePathForYearImage } from '@/app/path';

export const generateMetaForYear = (
  year: string,
  photos: Media[],
  appText: AppTextState,
  count?: number,
  _dateRange?: MediaDateRangePostgres,
) => {
  const title = appText.category.yearTitle(year);
  const description = descriptionForMediaSet(
    photos,
    appText,
    undefined,
    undefined,
    count,
  );
  const url = absolutePathForYear(year);
  const images = absolutePathForYearImage(year);

  return {
    title,
    description,
    url,
    images,
  };
};
