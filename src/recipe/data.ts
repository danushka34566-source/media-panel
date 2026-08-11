import {
  getMediaCached,
  getMediaMetaCached,
} from '@/media/cache';

export const getMediaRecipeDataCached = ({
  recipe,
  limit,
}: {
  recipe: string,
  limit?: number,
}) =>
  Promise.all([
    getMediaCached({ recipe, limit }),
    getMediaMetaCached({ recipe }),
  ]);
