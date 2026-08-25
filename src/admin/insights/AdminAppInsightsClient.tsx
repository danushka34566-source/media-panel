'use client';

import ScoreCard from '@/components/ScoreCard';
import ScoreCardRow from '@/components/ScoreCardRow';
import { formattedDateRangeForMedia } from '@/media';
import {
  FaArrowRight,
  FaBuilding,
  FaCircleInfo,
  FaRegCalendar,
  FaUsers,
} from 'react-icons/fa6';
import { MdAspectRatio } from 'react-icons/md';
import { PiWarningBold } from 'react-icons/pi';
import { BiGitBranch, BiGitCommit, BiLogoGithub } from 'react-icons/bi';
import {
  TEMPLATE_REPO_BRANCH,
  TEMPLATE_REPO_OWNER,
  TEMPLATE_REPO_NAME,
  VERCEL_GIT_COMMIT_SHA_SHORT,
  VERCEL_GIT_COMMIT_MESSAGE,
  TEMPLATE_REPO_URL_FORK,
  TEMPLATE_REPO_URL_README,
  USED_DEPRECATED_ENV_VARS,
} from '@/app/config';
import {
  getAllInsights,
  getGitHubMetaForCurrentApp,
  hasTemplateRecommendations,
  MediaStats,
} from '.';
import EnvVar from '@/components/EnvVar';
import { IoSyncCircle } from 'react-icons/io5';
import clsx from 'clsx/lite';
import {
  PATH_ADMIN_CONFIGURATION,
  PATH_ADMIN_MEDIA_UPDATES,
} from '@/app/path';
import { LiaBroomSolid } from 'react-icons/lia';
import { IoMdGrid } from 'react-icons/io';
import { RiSpeedMiniLine } from 'react-icons/ri';
import AdminLink from '../AdminLink';
import AdminEmptyState from '../AdminEmptyState';
import { pluralize } from '@/utility/string';
import Tooltip from '@/components/Tooltip';
import { useAppState } from '@/app/AppState';
import ScoreCardContainer from '@/components/ScoreCardContainer';
import IconLens from '@/components/icons/IconLens';
import IconCamera from '@/components/icons/IconCamera';
import IconRecipe from '@/components/icons/IconRecipe';
import IconFilm from '@/components/icons/IconFilm';
import IconFocalLength from '@/components/icons/IconFocalLength';
import IconTag from '@/components/icons/IconTag';
import IconMedia from '@/components/icons/IconMedia';
import IconAlbum from '@/components/icons/IconAlbum';
import IconYear from '@/components/icons/IconYear';
import { LuPlay } from 'react-icons/lu';
import { HiOutlineDocumentText } from 'react-icons/hi';
import { ReactNode } from 'react';
import MaskedScroll from '@/components/MaskedScroll';
import IconNext from '@/components/icons/IconNext';
import Link from 'next/link';
import { capitalizeWords } from '@/utility/string';

const DEBUG_COMMIT_SHA = '4cd29ed';
const DEBUG_COMMIT_MESSAGE = 'Long commit message for debugging purposes';
const DEBUG_BEHIND_BY = 9;
const DEBUG_MEDIA_NEED_SYNC_COUNT = 7;

const TEXT_COLOR_WARNING  = 'text-amber-600 dark:text-amber-500';
const TEXT_COLOR_BLUE     = 'text-blue-600 dark:text-blue-500';

const readmeAnchor = (anchor: string) =>
  <AdminLink href={`${TEMPLATE_REPO_URL_README}#${anchor}`}>
    README/{anchor}
  </AdminLink>;

const renderLabeledEnvVar = (
  label: string,
  variable: string,
  value?: string,
  icon?: ReactNode,
) =>
  <div className="flex flex-col gap-0.5">
    <span className="text-xs uppercase font-medium tracking-wider">
      {label}
    </span>
    {icon
      ? <div className="flex items-center gap-1">
        {icon} <EnvVar {...{ variable, value }} />
      </div>
      :<EnvVar {...{ variable, value }} />}
  </div>;

const libraryCountLabel = (
  count: number,
  collectionLabel: string,
) => `${capitalizeWords(collectionLabel)} (${count})`;

const renderHighlightText = (
  text: string,
  color: 'blue' | 'yellow' = 'blue',
  truncate = true,
) =>
  <span className={clsx(
    'px-1.5 pb-[1px] rounded-md',
    truncate && 'max-w-full inline-block',
    truncate && 'text-ellipsis whitespace-nowrap overflow-x-clip',
    color === 'blue' && 'text-blue-600 bg-blue-100/60',
    color === 'blue' && 'dark:text-blue-400 dark:bg-blue-900/50',
    color === 'yellow' && 'text-amber-700 bg-amber-100/50',
    color === 'yellow' && 'dark:text-amber-400 dark:bg-amber-900/35',
  )}>
    {text}
  </span>;

const renderWarningIconLarge =
  <PiWarningBold
    size={17}
    className={clsx(
      'translate-x-[0.5px]',
      TEXT_COLOR_WARNING,
    )}
  />;

const renderWarningIconSmall =
  <PiWarningBold
    size={14}
    className="translate-y-[0.5px] text-extra-dim"
  />;

export default function AdminAppInsightsClient({
  codeMeta,
  nextVersion,
  insights,
  usedDeprecatedEnvVars,
  mediaStats: {
    mediaCountNeedSync,
    categoriesCount,
    camerasCount,
    albumsCount,
    lensesCount,
    studiosCount,
    performersCount,
    tagsCount,
    recipesCount,
    filmsCount,
    focalLengthsCount,
    yearsCount,
    dateRange,
    mediaCounts,
    mediaCountsHidden,
  },
}: {
  codeMeta?: Awaited<ReturnType<typeof getGitHubMetaForCurrentApp>>
  nextVersion: string
  insights: ReturnType<typeof getAllInsights>
  usedDeprecatedEnvVars: typeof USED_DEPRECATED_ENV_VARS
  mediaStats: MediaStats
}) {
  const { shouldDebugInsights: debug } = useAppState();

  const {
    deprecatedEnvVars,
    noFork,
    forkBehind,
    noRateLimiting,
    noConfiguredDomain,
    noConfiguredMetaTitle,
    noConfiguredMetaDescription,
    mediaNeedSync,
    photoMatting,
    gridFirst,
    noStaticOptimization,
  } = insights;

  const { descriptionWithSpaces } =
    formattedDateRangeForMedia(undefined, dateRange);

  const branchLink = <a
    className="truncate"
    href={codeMeta?.urlBranch}
    target="blank"
  >
    {codeMeta?.branch ?? TEMPLATE_REPO_BRANCH}
  </a>;

  const renderTooltipContent = (content: ReactNode) =>
    <Tooltip
      content={content}
      classNameTrigger="ml-1.5"
      supportMobile
    />;

  return (
    <ScoreCardContainer>
      {(codeMeta || debug) && <>
        <ScoreCard title="Source code">
          {(codeMeta?.didError || debug) &&
            <ScoreCardRow
              icon={<IoSyncCircle
                size={18}
                className={TEXT_COLOR_WARNING}
              />}
              content={<>
                <span>Could not analyze source code</span>
                {renderTooltipContent(
                  'Could not connect to GitHub API. Try refreshing.',
                )}
              </>}
            />}
          {((!codeMeta?.didError && noFork) || debug) &&
            <ScoreCardRow
              icon={<FaCircleInfo 
                size={15}
                className="text-blue-500 translate-y-[1px]"
              />}
              content="This template is not forked"
              expandContent={<>
                <AdminLink href={TEMPLATE_REPO_URL_FORK}>
                  Fork original template
                </AdminLink>
                {' '}
                to receive the latest fixes and features.
                {' '}
                Additional instructions in
                {' '}
                {readmeAnchor('receiving-updates')}.
              </>}
            />}
          {((!codeMeta?.didError && forkBehind) || debug) && <ScoreCardRow
            icon={<IoSyncCircle
              size={18}
              className="text-blue-500"
            />}
            content={<>
              This fork is
              {' '}
              {renderHighlightText(
                pluralize(codeMeta?.behindBy ?? DEBUG_BEHIND_BY, 'commit'),
                'blue',
              )}
              {' '}
              behind
            </>}
            expandContent={<>
              <AdminLink href={codeMeta?.urlRepo ?? ''}>
                Sync your fork
              </AdminLink>
              {' '}
              to receive the latest fixes and features.
            </>}
          />}
          <ScoreCardRow
            icon={<BiLogoGithub size={17} />}
            content={<div
              className="flex flex-wrap gap-x-4 gap-y-1 overflow-auto"
            >
              <div className="flex items-center gap-1 *:whitespace-nowrap">
                <a
                  href={codeMeta?.urlOwner}
                  target="blank"
                >
                  {codeMeta?.owner ?? TEMPLATE_REPO_OWNER}
                </a>
                <div>/</div>
                <a
                  href={codeMeta?.urlRepo}
                  target="blank"
                >
                  {codeMeta?.repo ?? TEMPLATE_REPO_NAME}
                </a>
              </div>
              <div className="hidden sm:flex items-center gap-1 min-w-0">
                <BiGitBranch size={17} />
                {branchLink}
              </div>
            </div>}
          />
          <ScoreCardRow
            className="sm:hidden"
            icon={<BiGitBranch size={17} />}
            content={branchLink}
          />
          <ScoreCardRow
            icon={<BiGitCommit
              size={18}
              className="translate-y-[-0.5px]"
            />}
            content={<a
              href={codeMeta?.urlCommit}
              target="blank"
              className="flex items-center gap-2"
            >
              <span className="text-medium hidden sm:inline-block">
                {VERCEL_GIT_COMMIT_SHA_SHORT ?? DEBUG_COMMIT_SHA}
              </span>
              <span className="truncate">
                {VERCEL_GIT_COMMIT_MESSAGE ?? DEBUG_COMMIT_MESSAGE}
              </span>
            </a>}
          />
          <ScoreCardRow
            icon={<IconNext className="self-start translate-y-px" />}
            content={<Link
              // eslint-disable-next-line max-len
              href={`https://github.com/vercel/next.js/releases/tag/v${nextVersion}`}
              target="blank"
            >
              Next.js {nextVersion}
            </Link>}
          />
        </ScoreCard>
      </>}
      <ScoreCard title="Template recommendations">
        {(hasTemplateRecommendations(insights) || debug)
          ? <>
            {(deprecatedEnvVars || debug) && <ScoreCardRow
              icon={renderWarningIconLarge}
              content={isExpanded => renderHighlightText(
                'Update environment variables',
                'yellow',
                !isExpanded,
              )}
              expandContent={<div className="flex flex-col gap-2">
                Future versions of this template may not build correctly
                with the following deprecated environment variables:
                <div className="space-y-1">
                  {usedDeprecatedEnvVars.map(({ old, replacement }) => (
                    <MaskedScroll
                      key={old}
                      className={clsx(
                        'inline-flex items-center gap-3',
                        'overflow-y-hidden',
                      )}
                      direction="horizontal"
                    >
                      <div className={clsx(
                        'inline-flex items-center gap-1.5',
                        'text-xs font-medium',
                      )}>
                        {renderWarningIconSmall}
                        {old}
                      </div>
                      <FaArrowRight
                        size={11}
                        className="shrink-0 text-extra-dim"
                      />
                      <EnvVar variable={replacement} maskScroll={false} />
                    </MaskedScroll>
                  ))}
                </div>
              </div>}
            />}
            {(noRateLimiting || debug) && <ScoreCardRow
              icon={renderWarningIconLarge}
              content={isExpanded => renderHighlightText(
                'Enable rate limiting',
                'yellow',
                !isExpanded,
              )}
              expandContent={<>
                Create Upstash Redis store from storage tab on
                Vercel dashboard and link to this project to
                prevent unexpected usage by enabling rate limiting.
              </>}
            />}
            {(noConfiguredDomain || debug) && <ScoreCardRow
              icon={renderWarningIconLarge}
              content={isExpanded => renderHighlightText(
                'Configure domain',
                'yellow',
                !isExpanded,
              )}
              expandContent={<>
                Not setting an explicit domain may cause certain features
                to behave unexpectedly. Domains are stored in
                {' '}
                <EnvVar
                  variable="NEXT_PUBLIC_DOMAIN"
                  trailingContent="."
                />
              </>}
            />}
            {(
              noConfiguredMetaTitle ||
              noConfiguredMetaDescription ||
              debug
            ) && <ScoreCardRow
              icon={<HiOutlineDocumentText
                size={18}
                className="translate-x-[1px] translate-y-[-1px]"
              />}
              content="Configure meta"
              expandContent={<>
                Configure site title (visible in search results and browser tab)
                and site description (visible in search results):
                {' '}
                <div className="flex flex-col gap-y-4 mt-3">
                  {(
                    noConfiguredMetaTitle ||
                    debug
                  ) && renderLabeledEnvVar(
                    'Site title',
                    'NEXT_PUBLIC_META_TITLE',
                  )}
                  {(
                    noConfiguredMetaDescription ||
                    debug
                  ) && renderLabeledEnvVar(
                    'Site description',
                    'NEXT_PUBLIC_META_DESCRIPTION',
                  )}
                </div>
              </>}
            />}
            {(noStaticOptimization || debug) && <ScoreCardRow
              icon={<RiSpeedMiniLine
                size={19}
                className="translate-x-[1px] translate-y-[-1.5px]"
              />}
              content="Speed up page load times"
              expandContent={<>
                Improve load times by enabling one or more static
                optimization options in the
                {' '}
                <AdminLink
                  href={`${PATH_ADMIN_CONFIGURATION}#performance`}
                >
                  Performance settings
                </AdminLink>
                :
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  <li>Media pages</li>
                  <li>Media social images</li>
                  <li>Category pages</li>
                  <li>Category social images</li>
                </ul>
                <span className="mt-3 block">
                  See {readmeAnchor('performance')} for cost implications.
                </span>
              </>}
            />}
            {(photoMatting || debug) && <ScoreCardRow
              icon={<MdAspectRatio
                size={17}
                className="rotate-90 translate-x-[-1px]"
              />}
              content="Vertical photos may benefit from matting"
              expandContent={<>
                Enable photo matting to make
                {' '}
                portrait and landscape photos appear more consistent
                {' '}
                <EnvVar
                  variable="NEXT_PUBLIC_MATTE_MEDIA"
                  value="1"
                  trailingContent="."
                />
              </>}
            />}
            {(gridFirst || debug) && <ScoreCardRow
              icon={<IoMdGrid size={18} className="translate-y-[-1px]" />}
              content="Grid homepage"
              expandContent={<>
                Now that you have enough photos, consider switching your
                {' '}
                default view to grid by setting
                {' '}
                <EnvVar
                  variable="NEXT_PUBLIC_GRID_HOMEPAGE"
                  value="1"
                  trailingContent="."
                />
              </>}
            />}
          </>
          : <AdminEmptyState includeContainer={false}>
            Nothing to report!
          </AdminEmptyState>}
      </ScoreCard>
      <ScoreCard title="Library Stats">
        {(mediaNeedSync || debug) && <ScoreCardRow
          icon={<LiaBroomSolid
            size={19}
            className={clsx(
              'translate-y-[-2px]',
              TEXT_COLOR_BLUE,
            )}
          />}
          content={<>
            {renderHighlightText(
              pluralize(
                mediaCountNeedSync || DEBUG_MEDIA_NEED_SYNC_COUNT,
                'photo',
              ),
              'blue',
            )}
            {' '}
            with updates
            {renderTooltipContent(<>
              Missing data or AI&#8209;generated text
            </>)}
          </>}
          expandPath={PATH_ADMIN_MEDIA_UPDATES}
        />}
        {mediaCounts?.photos && mediaCounts.videos ? <ScoreCardRow
          icon={<IconMedia
            size={15}
            className="translate-y-[0.5px]"
          />}
          content={<>
            {libraryCountLabel(mediaCounts.total, 'media')}
            {mediaCountsHidden && mediaCountsHidden.total > 0
              ? ` (${mediaCountsHidden.total} hidden)`
              : ''}
          </>}
        /> : null}
        {mediaCounts?.photos ? <ScoreCardRow
          icon={<IconMedia size={15} className="translate-y-[0.5px]" />}
          content={libraryCountLabel(mediaCounts.photos, 'photos')}
        /> : null}
        {mediaCounts?.videos ? <ScoreCardRow
          icon={<LuPlay size={14} className="translate-y-[1px]" />}
          content={libraryCountLabel(mediaCounts.videos, 'videos')}
        /> : null}
        {yearsCount > 0 && <ScoreCardRow
          icon={<IconYear size={15} />}
          content={libraryCountLabel(yearsCount, 'years')}
        />}
        {albumsCount > 0 && <ScoreCardRow
          icon={<IconAlbum size={15} />}
          content={libraryCountLabel(albumsCount, 'albums')}
        />}
        {categoriesCount > 0 && <ScoreCardRow
          icon={<IconTag
            size={15}
            className="translate-x-[1px] translate-y-[1px]"
          />}
          content={libraryCountLabel(categoriesCount, 'categories')}
        />}
        {studiosCount > 0 && <ScoreCardRow
          icon={<FaBuilding size={14} />}
          content={libraryCountLabel(studiosCount, 'studios')}
        />}
        {performersCount > 0 && <ScoreCardRow
          icon={<FaUsers size={15} />}
          content={libraryCountLabel(performersCount, 'performers')}
        />}
        {camerasCount > 0 && <ScoreCardRow
          icon={<IconCamera size={15} className="translate-y-[0.5px]" />}
          content={libraryCountLabel(camerasCount, 'cameras')}
        />}
        {lensesCount > 0 && <ScoreCardRow
          icon={<IconLens size={15} className="translate-y-[0.5px]" />}
          content={libraryCountLabel(lensesCount, 'lenses')}
        />}
        {tagsCount > 0 && <ScoreCardRow
          icon={<IconTag
            size={15}
            className="translate-x-[1px] translate-y-[1px]"
          />}
          content={libraryCountLabel(tagsCount, 'tags')}
        />}
        {recipesCount > 0 && <ScoreCardRow
          icon={<IconRecipe
            size={18}
            className="translate-x-[0.5px] translate-y-[-0.5px]"
          />}
          content={libraryCountLabel(recipesCount, 'recipes')}
        />}
        {filmsCount > 0 && <ScoreCardRow
          icon={<IconFilm size={15} />}
          content={libraryCountLabel(filmsCount, 'films')}
        />}
        {focalLengthsCount > 0 && <ScoreCardRow
          icon={<IconFocalLength size={14} />}
          content={libraryCountLabel(focalLengthsCount, 'focal lengths')}
        />}
        {descriptionWithSpaces && <ScoreCardRow
          icon={<FaRegCalendar
            size={13}
            className="translate-y-[1.5px]"
          />}
          content={descriptionWithSpaces}
        />}
      </ScoreCard>
    </ScoreCardContainer>
  );
}
