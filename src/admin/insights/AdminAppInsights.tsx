import {
  getMediaTypeCounts,
  getUniqueCameras,
  getUniqueCategories,
  getUniqueFilms,
  getUniqueFocalLengths,
  getUniqueLenses,
  getUniquePerformersWithMeta,
  getUniqueRecipes,
  getUniqueStudiosWithMeta,
  getUniqueTags,
  getUniqueYears,
} from '@/media/query';
import {
  getMediaMetaCached,
  getMediaInNeedOfUpdateCountCached,
} from '@/media/cache';
import AdminAppInsightsClient from './AdminAppInsightsClient';
import { getAllInsights, getGitHubMetaForCurrentApp } from '.';
import { USED_DEPRECATED_ENV_VARS } from '@/app/config';
import { dependencies } from '../../../package.json';
import { getAlbumsWithMeta } from '@/album/query';
import { getApplicationSettingsSafe } from '@/app/application-settings';

export default async function AdminAppInsights() {
  const [
    { count: mediaCount, dateRange },
    { count: hiddenMediaCount },
    mediaCountNeedSync,
    { count: portraitMediaCount },
    codeMeta,
    applicationSettings,
    categories,
    cameras,
    albums,
    lenses,
    studios,
    performers,
    tags,
    recipes,
    films,
    focalLengths,
    years,
    mediaCountsTotal,
    mediaCountsHidden,
  ] = await Promise.all([
    getMediaMetaCached({ hidden: 'include' }),
    getMediaMetaCached({ hidden: 'only' }),
    getMediaInNeedOfUpdateCountCached(),
    getMediaMetaCached({ maximumAspectRatio: 0.9 }),
    getGitHubMetaForCurrentApp(),
    getApplicationSettingsSafe(),
    getUniqueCategories(),
    getUniqueCameras(),
    getAlbumsWithMeta(),
    getUniqueLenses(),
    getUniqueStudiosWithMeta(),
    getUniquePerformersWithMeta(),
    getUniqueTags(),
    getUniqueRecipes(),
    getUniqueFilms(),
    getUniqueFocalLengths(),
    getUniqueYears(),
    getMediaTypeCounts({ hidden: 'include' }),
    getMediaTypeCounts({ hidden: 'only' }),
  ]);

  return (
    <AdminAppInsightsClient
      codeMeta={codeMeta}
      nextVersion={dependencies.next}
      insights={getAllInsights({
        codeMeta,
        mediaCount,
        mediaCountNeedSync,
        portraitMediaCount,
        isStaticOptimizationEnabled: Object.values(applicationSettings)
          .some(Boolean),
      })}
      usedDeprecatedEnvVars={USED_DEPRECATED_ENV_VARS}
      mediaStats={{
        mediaCount,
        hiddenMediaCount,
        mediaCountNeedSync,
        categoriesCount: categories.length,
        camerasCount: cameras.length,
        albumsCount: albums.filter(({ count }) => count > 0).length,
        lensesCount: lenses.length,
        studiosCount: studios.length,
        performersCount: performers.length,
        tagsCount: tags.length,
        recipesCount: recipes.length,
        filmsCount: films.length,
        focalLengthsCount: focalLengths.length,
        yearsCount: years.length,
        dateRange,
        mediaCounts: mediaCountsTotal,
        mediaCountsHidden,
      }}
    />
  );
}
