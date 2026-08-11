import {
  getMediaTypeCounts,
  getUniqueCameras,
  getUniqueFilms,
  getUniqueFocalLengths,
  getUniqueLenses,
  getUniqueRecipes,
  getUniqueTags,
} from '@/media/query';
import {
  getMediaMetaCached,
  getMediaInNeedOfUpdateCountCached,
} from '@/media/cache';
import AdminAppInsightsClient from './AdminAppInsightsClient';
import { getAllInsights, getGitHubMetaForCurrentApp } from '.';
import { USED_DEPRECATED_ENV_VARS } from '@/app/config';
import { dependencies } from '../../../package.json';

export default async function AdminAppInsights() {
  const [
    { count: photosCount, dateRange },
    { count: photosCountHidden },
    photosCountNeedSync,
    { count: photosCountPortrait },
    codeMeta,
    cameras,
    lenses,
    tags,
    recipes,
    films,
    focalLengths,
    mediaCountsTotal,
    mediaCountsHidden,
  ] = await Promise.all([
    getMediaMetaCached({ hidden: 'include' }),
    getMediaMetaCached({ hidden: 'only' }),
    getMediaInNeedOfUpdateCountCached(),
    getMediaMetaCached({ maximumAspectRatio: 0.9 }),
    getGitHubMetaForCurrentApp(),
    getUniqueCameras(),
    getUniqueLenses(),
    getUniqueTags(),
    getUniqueRecipes(),
    getUniqueFilms(),
    getUniqueFocalLengths(),
    getMediaTypeCounts({ hidden: 'include' }),
    getMediaTypeCounts({ hidden: 'only' }),
  ]);

  return (
    <AdminAppInsightsClient
      codeMeta={codeMeta}
      nextVersion={dependencies.next}
      insights={getAllInsights({
        codeMeta,
        photosCount,
        photosCountNeedSync,
        photosCountPortrait,
      })}
      usedDeprecatedEnvVars={USED_DEPRECATED_ENV_VARS}
      photoStats={{
        photosCount,
        photosCountHidden,
        photosCountNeedSync,
        camerasCount: cameras.length,
        lensesCount: lenses.length,
        tagsCount: tags.length,
        recipesCount: recipes.length,
        filmsCount: films.length,
        focalLengthsCount: focalLengths.length,
        dateRange,
        mediaCounts: mediaCountsTotal,
        mediaCountsHidden,
      }}
    />
  );
}
