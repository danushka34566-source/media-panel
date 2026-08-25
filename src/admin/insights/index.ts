import {
  VERCEL_GIT_BRANCH,
  VERCEL_GIT_COMMIT_SHA,
  VERCEL_GIT_REPO_OWNER,
  VERCEL_GIT_REPO_SLUG,
  IS_VERCEL_GIT_PROVIDER_GITHUB,
  IS_DEVELOPMENT,
  APP_CONFIGURATION,
  MATTE_MEDIA,
  IS_META_DESCRIPTION_CONFIGURED,
  IS_META_TITLE_CONFIGURED,
  GRID_HOMEPAGE_ENABLED,
  HAS_DEPRECATED_ENV_VARS,
} from '@/app/config';
import { MediaDateRangePostgres } from '@/media';
import { getGitHubMeta } from '@/platforms/github';

const BASIC_MEDIA_INSTALLATION_COUNT = 32;

const AdminAppInsightCode = [
  'noFork',
  'forkBehind',
] as const;
type AdminAppInsightCode = typeof AdminAppInsightCode[number];

const _INSIGHTS_TEMPLATE = [
  'deprecatedEnvVars',
  'noRateLimiting',
  'noConfiguredDomain',
  'noConfiguredMetaTitle',
  'noConfiguredMetaDescription',
  'photoMatting',
  'gridFirst',
  'noStaticOptimization',
] as const;
type AdminAppInsightRecommendation = typeof _INSIGHTS_TEMPLATE[number];

const _INSIGHTS_LIBRARY = [
  'mediaNeedSync',
] as const;
type AdminAppInsightLibrary = typeof _INSIGHTS_LIBRARY[number];

export type AdminAppInsight =
  AdminAppInsightCode |
  AdminAppInsightRecommendation |
  AdminAppInsightLibrary;

export type AdminAppInsights = Record<AdminAppInsight, boolean>

export type InsightsIndicatorStatus = 'blue' | 'yellow' | undefined;

export const hasTemplateRecommendations = (insights: AdminAppInsights) =>
  _INSIGHTS_TEMPLATE.some(insight => insights[insight]);

export interface MediaStats {
  mediaCount: number
  hiddenMediaCount: number
  mediaCountNeedSync: number
  categoriesCount: number
  camerasCount: number
  albumsCount: number
  lensesCount: number
  studiosCount: number
  performersCount: number
  tagsCount: number
  recipesCount: number
  filmsCount: number
  focalLengthsCount: number
  yearsCount: number
  dateRange?: MediaDateRangePostgres
  mediaCounts?: { photos: number, videos: number, total: number }
  mediaCountsHidden?: { photos: number, videos: number, total: number }
}

export const getGitHubMetaForCurrentApp = () =>
  (IS_VERCEL_GIT_PROVIDER_GITHUB || IS_DEVELOPMENT)
    ? getGitHubMeta({
      owner: VERCEL_GIT_REPO_OWNER,
      repo: VERCEL_GIT_REPO_SLUG,
      branch: VERCEL_GIT_BRANCH,
      commit: VERCEL_GIT_COMMIT_SHA,
    })
    : undefined;

export const getSignificantInsights = ({
  codeMeta,
  mediaCountNeedSync,
}: {
  codeMeta: Awaited<ReturnType<typeof getGitHubMetaForCurrentApp>>
  mediaCountNeedSync: number
}) => {
  const {
    isAiTextGenerationEnabled,
    hasLocationServices,
    hasRedisStorage,
    hasDomain,
  } = APP_CONFIGURATION;

  return {
    deprecatedEnvVars: HAS_DEPRECATED_ENV_VARS,
    forkBehind: Boolean(codeMeta?.isBehind),
    noRateLimiting: (
      isAiTextGenerationEnabled ||
      hasLocationServices
    ) && !hasRedisStorage,
    noConfiguredDomain: !hasDomain,
    mediaNeedSync: Boolean(mediaCountNeedSync),
  };
};

export const indicatorStatusForSignificantInsights = ({
  codeMeta,
  mediaCountNeedSync,
}: Parameters<typeof getSignificantInsights>[0] & {
  mediaCountNeedSync: number
}) => {
  const insights = getSignificantInsights({
    codeMeta,
    mediaCountNeedSync,
  });

  const {
    deprecatedEnvVars,
    forkBehind,
    noRateLimiting,
    noConfiguredDomain,
    mediaNeedSync,
  } = insights;

  if (deprecatedEnvVars || noRateLimiting || noConfiguredDomain) {
    return 'yellow';
  } else if (forkBehind || mediaNeedSync) {
    return 'blue';
  }
};

export const getAllInsights = ({
  codeMeta,
  mediaCountNeedSync,
  mediaCount,
  portraitMediaCount,
  isStaticOptimizationEnabled,
}: Parameters<typeof getSignificantInsights>[0] & {
  mediaCount: number
  portraitMediaCount: number
  isStaticOptimizationEnabled: boolean
}) => ({
  ...getSignificantInsights({ codeMeta, mediaCountNeedSync }),
  noFork: !codeMeta?.isForkedFromBase && !codeMeta?.isBaseRepo,
  noConfiguredMetaTitle: !IS_META_TITLE_CONFIGURED,
  noConfiguredMetaDescription: !IS_META_DESCRIPTION_CONFIGURED,
  photoMatting: portraitMediaCount > 0 && !MATTE_MEDIA,
  gridFirst: (
    mediaCount >= BASIC_MEDIA_INSTALLATION_COUNT &&
    !GRID_HOMEPAGE_ENABLED
  ),
  noStaticOptimization: !isStaticOptimizationEnabled,
});
