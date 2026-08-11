import { descriptionForMediaSet, Media, MediaDateRangePostgres } from '@/media';
import { AppTextState } from '@/i18n/state';
import {
  absolutePathForRecents,
  absolutePathForRecentsImage,
} from '@/app/path';

export const generateMetaForRecents = (
  photos: Media[],
  appText: AppTextState,
  count?: number,
  _dateRange?: MediaDateRangePostgres,
) => {
  const title = appText.category.recentTitle;
  const description = descriptionForMediaSet(
    photos,
    appText,
    undefined,
    undefined,
    count,
  );
  const url = absolutePathForRecents();
  const images = absolutePathForRecentsImage();

  return {
    title,
    description,
    url,
    images,
  };
};
