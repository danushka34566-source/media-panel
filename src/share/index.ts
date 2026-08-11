import { Media } from '@/media';
import { MediaSetAttributes, MediaSetCategory } from '@/category';
import {
  absolutePathForCameraImage,
  absolutePathForCategoryImage,
  absolutePathForContentTypeImage,
  absolutePathForFilmImage,
  absolutePathForFocalLengthImage,
  absolutePathForLensImage,
  absolutePathForMediaImage,
  absolutePathForPerformerImage,
  absolutePathForRecipeImage,
  absolutePathForStudioImage,
  absolutePathForTagImage,
  absolutePathForYearImage,
} from '@/app/path';

export type ShareModalProps = Omit<MediaSetAttributes, 'photos'> & {
  photo?: Media
  photos?: Media[]
} & MediaSetCategory;

export const getSharePathFromShareModalProps = ({
  photo,
  camera,
  lens,
  tag,
  category,
  studio,
  performer,
  contentType,
  recipe,
  film,
  focal,
  year,
}: ShareModalProps) => {
  if (photo) {
    return absolutePathForMediaImage(photo);
  } else if (camera) {
    return absolutePathForCameraImage(camera);
  } else if (lens) {
    return absolutePathForLensImage(lens);
  } else if (tag) {
    return absolutePathForTagImage(tag);
  } else if (category) {
    return absolutePathForCategoryImage(category);
  } else if (studio) {
    return absolutePathForStudioImage(studio);
  } else if (performer) {
    return absolutePathForPerformerImage(performer);
  } else if (contentType) {
    return absolutePathForContentTypeImage(contentType);
  } else if (recipe) {
    return absolutePathForRecipeImage(recipe);
  } else if (film) {
    return absolutePathForFilmImage(film);
  } else if (focal) {
    return absolutePathForFocalLengthImage(focal);
  } else if (year) {
    return absolutePathForYearImage(year);
  }
};
