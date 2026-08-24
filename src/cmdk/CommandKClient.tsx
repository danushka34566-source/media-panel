'use client';

import { Command } from 'cmdk';
import {
  ReactNode,
  SetStateAction,
  Dispatch,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  PATH_ADMIN_BASELINE,
  PATH_ADMIN_COMPONENTS,
  PATH_ADMIN_CONFIGURATION,
  PATH_ADMIN_INSIGHTS,
  PATH_ADMIN_STATS,
  PATH_ADMIN_MEDIA,
  PATH_ADMIN_PROCESSING,
  PATH_ADMIN_RECIPES,
  PATH_ADMIN_TAGS,
  PATH_ADMIN_UPLOADS,
  PATH_ADMIN_USERS,
  PATH_FULL_INFERRED,
  PATH_FAVORITES,
  PATH_GRID_INFERRED,
  PATH_SIGN_IN,
  pathForAlbum,
  pathForCamera,
  pathForCategory,
  pathForContentType,
  pathForFilm,
  pathForFocalLength,
  pathForLens,
  pathForMedia,
  pathForPerformer,
  pathForRecipe,
  pathForStudio,
  pathForTag,
  pathForYear,
  PREFIX_RECENTS,
} from '../app/path';
import Modal from '../components/Modal';
import { clsx } from 'clsx/lite';
import { useDebounce } from 'use-debounce';
import Spinner from '../components/Spinner';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { BiDesktop, BiLockAlt, BiMoon, BiSun } from 'react-icons/bi';
import { IoClose, IoInvertModeSharp } from 'react-icons/io5';
import { useAppState } from '@/app/AppState';
import { searchMediaAction } from '@/media/actions';
import { RiToolsFill } from 'react-icons/ri';
import { searchUsersCommandAction } from '@/auth/actions';
import { getKeywordsForMedia, titleForMedia } from '@/media';
import MediaDate from '@/media/MediaDate';
import MediaSmall from '@/media/MediaSmall';
import {
  addPrivateToTags,
  formatTag,
  isTagFavs,
  isTagPrivate,
  limitTagsByCount,
} from '@/tag';
import { formatCount, formatCountDescriptive } from '@/utility/string';
import CommandKItem from './CommandKItem';
import {
  CATEGORY_VISIBILITY,
  COLOR_SORT_ENABLED,
  GRID_HOMEPAGE_ENABLED,
  HIDE_TAGS_WITH_ONE_MEDIA,
} from '@/app/config';
import { DialogDescription, DialogTitle } from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import InsightsIndicatorDot from '@/admin/insights/InsightsIndicatorDot';
import { MediaSetCategories } from '@/category';
import { formatCameraText } from '@/camera';
import { formatFocalLength } from '@/focal';
import { formatRecipe } from '@/recipe';
import IconLens from '../components/icons/IconLens';
import { formatLensText } from '@/lens';
import IconTag from '../components/icons/IconTag';
import IconCamera from '../components/icons/IconCamera';
import IconMedia from '../components/icons/IconMedia';
import IconRecipe from '../components/icons/IconRecipe';
import IconFocalLength from '../components/icons/IconFocalLength';
import IconFilm from '../components/icons/IconFilm';
import IconLock from '../components/icons/IconLock';
import IconYear from '../components/icons/IconYear';
import useViewportHeight from '@/utility/useViewportHeight';
import useMaskedScroll from '../components/useMaskedScroll';
import { labelForFilm } from '@/film';
import IconFavs from '@/components/icons/IconFavs';
import { useAppText } from '@/i18n/state/client';
import LoaderButton from '@/components/primitives/LoaderButton';
import IconRecents from '@/components/icons/IconRecents';
import { CgClose, CgFileDocument } from 'react-icons/cg';
import { FaRegUserCircle } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';
import IconCheck from '@/components/icons/IconCheck';
import { getSortStateFromPath } from '@/media/sort/path';
import IconSort from '@/components/icons/IconSort';
import { useSelectMediaState } from '@/admin/select/SelectMediaState';
import IconAlbum from '@/components/icons/IconAlbum';
import { formatMediaStringEntity } from '@/media/MediaStringEntity';
import UserAvatar from '@/components/UserAvatar';

const DIALOG_TITLE = 'Global Command-K Menu';
const DIALOG_DESCRIPTION = 'For searching photos, views, and settings';

const LISTENER_KEYDOWN = 'keydown';
const MINIMUM_QUERY_LENGTH = 2;

const MAX_HEIGHT = '20rem';

type CommandKItem = {
  label: ReactNode
  explicitKey?: string
  keywords?: string[]
  accessory?: ReactNode
  annotation?: ReactNode
  annotationAria?: string
  path?: string
  action?: () => void | Promise<void | boolean>
}

type CommandKSection = {
  heading: string
  accessory?: ReactNode
  items: CommandKItem[]
}

const renderCheck = (isChecked?: boolean) =>
  isChecked
    ? <IconCheck size={12} className="translate-y-[-0.5px]" />
    : undefined;

const renderToggle = (
  label: string,
  onToggle?: Dispatch<SetStateAction<boolean>>,
  isEnabled?: boolean,
): CommandKItem => ({
  label: `Toggle ${label}`,
  action: () => onToggle?.(prev => !prev),
  annotation: renderCheck(isEnabled),
});

export default function CommandKClient({
  recents,
  years: _years,
  cameras,
  lenses,
  albums,
  tags: _tags,
  recipes,
  films,
  focalLengths,
  categories,
  studios,
  performers,
  contentTypes,
  footer,
}: {
  footer?: string
  categories: { category: string, count: number }[]
  studios: { studio: string, count: number }[]
  performers: { performer: string, count: number }[]
  contentTypes: { contentType: string, count: number }[]
} & MediaSetCategories) {
  const pathname = usePathname();

  const appText = useAppText();

  const {
    isUserSignedIn,
    canEdit,
    canUpload,
    canManageUsers,
    canManageConfiguration,
    userRole,
    clearAuthStateAndRedirectIfNecessary,
    isCommandKOpen: isOpen,
    startUpload,
    photosCountTotal,
    photosCountHidden = 0,
    uploadsCount,
    tagsCount,
    recipesCount,
    insightsIndicatorStatus,
    isGridHighDensity,
    areZoomControlsShown,
    areMediaMatted,
    areAdminDebugToolsEnabled,
    shouldShowBaselineGrid,
    shouldDebugImageFallbacks,
    shouldDebugInsights,
    shouldDebugRecipeOverlays,
    setIsCommandKOpen: setIsOpen,
    setShouldShowBaselineGrid,
    setIsGridHighDensity,
    setAreZoomControlsShown,
    setAreMediaMatted,
    setShouldDebugImageFallbacks,
    setShouldDebugInsights,
    setShouldDebugRecipeOverlays,
  } = useAppState();

  const {
    isSelectingMedia,
    startSelectingMedia,
    stopSelectingMedia,
  } = useSelectMediaState();

  const {
    doesPathOfferSort,
    isSortedByDefault,
    isAscending,
    isTakenAt,
    isUploadedAt,
    isColor,
    descendingLabel,
    ascendingLabel,
    pathDescending,
    pathAscending,
    pathTakenAt,
    pathUploadedAt,
    pathColor,
    pathClearSort,
  } = useMemo(
    () => getSortStateFromPath(pathname, appText),
    [pathname, appText],
  );

  const isOpenRef = useRef(isOpen);

  const refInput = useRef<HTMLInputElement>(null);
  const mobileViewportHeight = useViewportHeight();
  const maxHeight = useMemo(() => {
    const positionY = refInput.current?.getBoundingClientRect().y;
    return mobileViewportHeight && positionY
      ? `min(${mobileViewportHeight - positionY - 32}px, ${MAX_HEIGHT})`
      : MAX_HEIGHT;
  }, [mobileViewportHeight]);

  const refScroll = useRef<HTMLDivElement>(null);
  const { styleMask, updateMask } = useMaskedScroll({
    ref: refScroll,
    updateMaskOnEvents: false,
    hideScrollbar: false,
  });
  
  // Manage action/path waiting state
  const [keyWaiting, setKeyWaiting] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [isWaitingForAction, setIsWaitingForAction] = useState(false);
  const isWaiting = isPending || isWaitingForAction;
  const shouldCloseAfterWaiting = useRef(false);
  useEffect(() => {
    if (!isWaiting) {
      setKeyWaiting(undefined);
      if (shouldCloseAfterWaiting.current) {
        setIsOpen?.(false);
        shouldCloseAfterWaiting.current = false;
      }
    }
  }, [isWaiting, setIsOpen]);

  // Raw query values
  const [queryLiveRaw, setQueryLiveRaw] = useState('');
  const [queryDebouncedRaw] =
    useDebounce(queryLiveRaw, 500, { trailing: true });

  // Parameterized query values
  const queryLive = useMemo(() =>
    queryLiveRaw.trim().toLocaleLowerCase(), [queryLiveRaw]);
  const queryDebounced = useMemo(() =>
    queryDebouncedRaw.trim().toLocaleLowerCase(), [queryDebouncedRaw]);
  const isUserSearch = Boolean(
    canManageUsers && queryDebounced.startsWith('users:'),
  );
  const isUserSearchLive = Boolean(
    canManageUsers && queryLive.startsWith('users:'),
  );

  const [isLoading, setIsLoading] = useState(false);
  const [queriedSections, setQueriedSections] = useState<CommandKSection[]>([]);

  const { setTheme } = useTheme();

  const router = useRouter();

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      const timeout = setTimeout(updateMask, 100);
      return () => clearTimeout(timeout);
    }
  }, [isOpen, updateMask]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen?.((open) => !open);
      }
    };
    document.addEventListener(LISTENER_KEYDOWN, down);
    return () => document.removeEventListener(LISTENER_KEYDOWN, down);
  }, [setIsOpen]);

  useEffect(() => {
    if (queryDebounced.length >= MINIMUM_QUERY_LENGTH && !isPending) {
      setIsLoading(true);
      if (isUserSearch) {
        searchUsersCommandAction(queryDebounced.slice('users:'.length))
          .then(users => {
            if (!isOpenRef.current) {
              setQueriedSections([]);
              return;
            }
            const roleSections = [
              ['superadmin', 'Super admins'],
              ['admin', 'Admins'],
              ['user', 'Users'],
            ] as const;
            setQueriedSections(roleSections.map(([role, heading]) => ({
              heading,
              accessory: <FaRegUserCircle size={14} />,
              items: users
                .filter(user => user.role === role)
                .map(user => ({
                  label: user.name,
                  explicitKey: user.id,
                  keywords: [
                    queryDebounced,
                    user.name.toLocaleLowerCase(),
                    user.email.toLocaleLowerCase(),
                    user.username?.toLocaleLowerCase() ?? '',
                    user.role,
                  ],
                  accessory: <UserAvatar
                    name={user.name}
                    email={user.email}
                    profileImageUrl={user.profileImageUrl}
                    sizeClass="size-8"
                    textClassName="text-[10px]"
                    showInitialsFallback
                  />,
                  annotation: user.status === 'active'
                    ? user.email
                    : `${user.email} · disabled`,
                  path: `${PATH_ADMIN_USERS}?user=${encodeURIComponent(user.id)}`,
                })),
            })).filter(section => section.items.length > 0));
          })
          .catch(error => {
            console.error(error);
            setQueriedSections([]);
          })
          .finally(() => setIsLoading(false));
        return;
      }
      searchMediaAction(queryDebounced)
        .then(photos => {
          if (isOpenRef.current) {
            setQueriedSections(photos.length > 0
              ? [{
                heading: 'Media',
                accessory: <IconMedia size={14} />,
                items: photos.map(photo => ({
                  label: titleForMedia(photo),
                  keywords: getKeywordsForMedia(photo),
                  annotation: <MediaDate {...{ photo, timezone: undefined }} />,
                  accessory: <MediaSmall photo={photo} />,
                  path: pathForMedia({ photo }),
                })),
              }]
              : []);
          } else {
            // Ignore stale requests that come in after dialog is closed
            setQueriedSections([]);
          }
          setIsLoading(false);
        })
        .catch(e => {
          console.error(e);
          setQueriedSections([]);
          setIsLoading(false);
        });
    }
  }, [queryDebounced, isPending, isUserSearch, appText]);

  useEffect(() => {
    if (queryLive === '') {
      setQueriedSections([]);
      setIsLoading(false);
    } else if (queryLive.length >= MINIMUM_QUERY_LENGTH) {
      setIsLoading(true);
    }
  }, [queryLive]);

  useEffect(() => {
    if (!isOpen) {
      setQueryLiveRaw('');
      setQueriedSections([]);
      setIsLoading(false);
    }
  }, [isOpen]);

  const recent = recents[0];
  const recentsStatus = useMemo(() => {
    if (!recent) { return undefined; }
    const { count, lastModified } = recent;
    const subhead = appText.category.recentSubhead(
      formatDistanceToNow(lastModified),
    );
    return count ? { count, subhead } : undefined;
  }, [recent, appText]);

  // Years only accessible by search
  const years = useMemo(() =>
    _years.filter(({ year }) => queryLive && year.includes(queryLive))
  , [_years, queryLive]);

  const tags = useMemo(() => {
    const tagsIncludingPrivate = photosCountHidden > 0
      ? addPrivateToTags(_tags, photosCountHidden)
      : _tags;
    return HIDE_TAGS_WITH_ONE_MEDIA
      ? limitTagsByCount(tagsIncludingPrivate, 2, queryLive)
      : tagsIncludingPrivate;
  }, [_tags, photosCountHidden, queryLive]);

  const categorySections: CommandKSection[] = useMemo(() =>
    CATEGORY_VISIBILITY
      .map(category => {
        switch (category) {
          case 'recents': return {
            heading: appText.category.recentPlural,
            accessory: <IconRecents size={15} />,
            items: recentsStatus ? [{
              label: recentsStatus.subhead,
              annotation: formatCount(recentsStatus.count),
              annotationAria: formatCountDescriptive(recentsStatus.count),
              path: PREFIX_RECENTS,
            }] : [],
          };
          case 'years': return {
            heading: appText.category.yearPlural,
            accessory: <IconYear size={14} />,
            items: years.map(({ year, count }) => ({
              label: year,
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForYear(year),
            })),
          };
          case 'cameras': return {
            heading: appText.category.cameraPlural,
            accessory: <IconCamera size={14} />,
            items: cameras.map(({ camera, count }) => ({
              label: formatCameraText(camera),
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForCamera(camera),
            })),
          };
          case 'lenses': return {
            heading: appText.category.lensPlural,
            accessory: <IconLens size={14} className="translate-y-[0.5px]" />,
            items: lenses.map(({ lens, count }) => ({
              label: formatLensText(lens, 'medium'),
              explicitKey: formatLensText(lens, 'long'),
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForLens(lens),
            })),
          };
          case 'albums': return {
            heading: appText.category.albumPlural,
            accessory: <IconAlbum size={14} />,
            items: albums.map(({ album, count }) => ({
              label: album.title,
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForAlbum(album),
            })),
          };
          case 'tags': return {
            heading: appText.category.tagPlural,
            accessory: <IconTag
              size={13}
              className="translate-x-[1px] translate-y-[0.75px]"
            />,
            items: tags.map(({ tag, count }) => ({
              explicitKey: formatTag(tag),
              label: <span className="flex items-center gap-[7px]">
                {formatTag(tag)}
                {isTagFavs(tag) &&
                  <IconFavs
                    size={13}
                    className="translate-y-[-0.5px]"
                    highlight
                  />}
                {isTagPrivate(tag) &&
                  <IconLock
                    size={12}
                    className="text-dim translate-y-[-0.5px]"
                  />}
              </span>,
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForTag(tag),
            })),
          };
          case 'recipes': return {
            heading: appText.category.recipePlural,
            accessory: <IconRecipe
              size={15}
              className="translate-x-[-1px]"
            />,
            items: recipes.map(({ recipe, count }) => ({
              label: formatRecipe(recipe),
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForRecipe(recipe),
            })),
          };
          case 'films': return {
            heading: appText.category.filmPlural,
            accessory: <IconFilm size={14} />,
            items: films.map(({ film, count }) => ({
              label: labelForFilm(film).medium,
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForFilm(film),
            })),
          };
          case 'focal-lengths': return {
            heading: appText.category.focalLengthPlural,
            accessory: <IconFocalLength className="text-[14px]" />,
            items: focalLengths.map(({ focal, count }) => ({
              label: formatFocalLength(focal),
              annotation: formatCount(count),
              annotationAria: formatCountDescriptive(count),
              path: pathForFocalLength(focal),
            })),
          };
        }
      })
      .filter(Boolean) as CommandKSection[]
  , [
    appText,
    recentsStatus,
    years,
    cameras,
    lenses,
    albums,
    tags,
    recipes,
    films,
    focalLengths,
  ]);

  const librarySections: CommandKSection[] = useMemo(() => [
    {
      heading: 'Categories',
      accessory: <IconTag
        size={13}
        className="translate-x-[1px] translate-y-[0.75px]"
      />,
      items: categories
        .filter(({ category }) => !queryLive || category.toLocaleLowerCase().includes(queryLive))
        .map(({ category, count }) => ({
          explicitKey: category,
          label: formatMediaStringEntity(category),
          keywords: [category, formatMediaStringEntity(category)],
        annotation: formatCount(count),
        annotationAria: formatCountDescriptive(count),
        path: pathForCategory(category),
        })),
    },
    {
      heading: 'Studios',
      accessory: <IconAlbum size={14} />,
      items: studios
        .filter(({ studio }) => !queryLive || studio.toLocaleLowerCase().includes(queryLive))
        .map(({ studio, count }) => ({
          explicitKey: studio,
          label: studio,
          keywords: [studio],
        annotation: formatCount(count),
        annotationAria: formatCountDescriptive(count),
        path: pathForStudio(studio),
        })),
    },
    {
      heading: 'Performers',
      accessory: <FaRegUserCircle size={14} />,
      items: performers
        .filter(({ performer }) => !queryLive || performer.toLocaleLowerCase().includes(queryLive))
        .map(({ performer, count }) => ({
          explicitKey: performer,
          label: performer,
          keywords: [performer],
        annotation: formatCount(count),
        annotationAria: formatCountDescriptive(count),
        path: pathForPerformer(performer),
        })),
    },
    {
      heading: 'Content Types',
      accessory: <CgFileDocument size={14} />,
      items: contentTypes
        .filter(({ contentType }) => !queryLive || contentType.toLocaleLowerCase().includes(queryLive))
        .map(({ contentType, count }) => ({
          explicitKey: contentType,
          label: formatMediaStringEntity(contentType),
          keywords: [contentType, formatMediaStringEntity(contentType)],
        annotation: formatCount(count),
        annotationAria: formatCountDescriptive(count),
        path: pathForContentType(contentType),
        })),
    },
  ], [categories, studios, performers, contentTypes, queryLive]);

  const clientSections: CommandKSection[] = [{
    heading: appText.theme.theme,
    accessory: <IoInvertModeSharp
      size={14}
      className="translate-y-[0.5px] translate-x-[-1px]"
    />,
    items: [{
      label: appText.theme.system,
      annotation: <BiDesktop />,
      action: () => setTheme('system'),
    }, {
      label: appText.theme.light,
      annotation: <BiSun size={16} className="translate-x-[1.25px]" />,
      action: () => setTheme('light'),
    }, {
      label: appText.theme.dark,
      annotation: <BiMoon className="translate-x-[1px]" />,
      action: () => setTheme('dark'),
    }],
  }];

  if (canEdit && areAdminDebugToolsEnabled) {
    clientSections.push({
      heading: 'Debug Tools',
      accessory: <RiToolsFill size={16} className="translate-x-[-1px]" />,
      items: [
        renderToggle(
          'Zoom Controls',
          setAreZoomControlsShown,
          areZoomControlsShown,
        ),
        renderToggle(
          'Media Matting',
          setAreMediaMatted,
          areMediaMatted,
        ),
        renderToggle(
          'High Density Grid',
          setIsGridHighDensity,
          isGridHighDensity,
        ),
        renderToggle(
          'Image Fallbacks',
          setShouldDebugImageFallbacks,
          shouldDebugImageFallbacks,
        ),
        renderToggle(
          'Baseline Grid',
          setShouldShowBaselineGrid,
          shouldShowBaselineGrid,
        ),
        renderToggle(
          'Insights Debugging',
          setShouldDebugInsights,
          shouldDebugInsights,
        ),
        renderToggle(
          'Recipe Overlays',
          setShouldDebugRecipeOverlays,
          shouldDebugRecipeOverlays,
        ),
      ],
    });
  }

  const sortItems = [{
    label: descendingLabel,
    path: pathDescending,
    annotation: renderCheck(!isAscending),
  }, {
    label: ascendingLabel,
    path: pathAscending,
    annotation: renderCheck(isAscending),
  }, {
    label: appText.sort.byTakenAt,
    path: pathTakenAt,
    annotation: renderCheck(isTakenAt),
  }, {
    label: appText.sort.byUploadedAt,
    path: pathUploadedAt,
    annotation: renderCheck(isUploadedAt),
  }];

  if (COLOR_SORT_ENABLED) {
    sortItems.push({
      label: appText.sort.byColor,
      path: pathColor,
      annotation: renderCheck(isColor),
    });
  }

  if (!isSortedByDefault) {
    sortItems.push({
      label: appText.sort.clearSort,
      path: pathClearSort,
      annotation: <CgClose />,
    });
  }

  const sortSection: CommandKSection = {
    heading: appText.sort.sort,
    accessory: <IconSort size={14} className="translate-x-[0.5px]" />,
    items: doesPathOfferSort
      ? sortItems
      : [],
  };

  const pageFull: CommandKItem = {
    label: GRID_HOMEPAGE_ENABLED
      ? appText.nav.full
      : `${appText.nav.full} (${appText.nav.home})`,
    path: PATH_FULL_INFERRED,
  };

  const pageGrid: CommandKItem = {
    label: GRID_HOMEPAGE_ENABLED
      ? `${appText.nav.grid} (${appText.nav.home})`
      : appText.nav.grid,
    path: PATH_GRID_INFERRED,
  };

  const pageItems: CommandKItem[] = GRID_HOMEPAGE_ENABLED
    ? [pageGrid, pageFull]
    : [pageFull, pageGrid];

  if (isUserSignedIn) {
    pageItems.push({
      label: 'Favorites',
      accessory: <IconFavs size={14} highlight />,
      path: PATH_FAVORITES,
    });
  }

  const sectionPages: CommandKSection = {
    heading: appText.cmdk.pages,
    accessory: <CgFileDocument size={14} className="translate-x-[-0.5px]" />,
    items: pageItems,
  };

  const adminSection: CommandKSection = {
    heading: appText.nav.admin,
    accessory: <FaRegUserCircle
      size={13}
      className="translate-x-[-0.5px] translate-y-[0.5px]"
    />,
    items: [],
  };

  if (canEdit) {
    if (canUpload) {
      adminSection.items.push({
        label: appText.admin.uploadMedia,
        annotation: <IconLock narrow />,
        action: startUpload,
      });
    }
    if (uploadsCount) {
      adminSection.items.push({
        label: `${appText.admin.uploadPlural} (${uploadsCount})`,
        annotation: <IconLock narrow />,
        path: PATH_ADMIN_UPLOADS,
      });
    }
    adminSection.items.push({
      label: 'Processing',
      annotation: <IconLock narrow />,
      path: PATH_ADMIN_PROCESSING,
    });
    adminSection.items.push({
      label: `${appText.admin.manageMedia} (${photosCountTotal})`,
      annotation: <IconLock narrow />,
      path: PATH_ADMIN_MEDIA,
    });
    if (tagsCount) {
      adminSection.items.push({
        label: `${appText.admin.manageTags} (${tagsCount})`,
        annotation: <IconLock narrow />,
        path: PATH_ADMIN_TAGS,
      });
    }
    if (recipesCount) {
      adminSection.items.push({
        label: `${appText.admin.manageRecipes} (${recipesCount})`,
        annotation: <IconLock narrow />,
        path: PATH_ADMIN_RECIPES,
      });
    }
    adminSection.items.push({
      label: isSelectingMedia
        ? appText.admin.selectMediaExit
        : appText.admin.selectMedia,
      annotation: <IconLock narrow />,
      // Search by legacy label
      keywords: ['batch', 'edit'],
      action: () => {
        if (!isSelectingMedia) {
          startSelectingMedia?.();
        } else {
          stopSelectingMedia?.();
        }
      },
    }, {
      label: <span className="flex items-center gap-3">
        {appText.admin.appInsights}
        {insightsIndicatorStatus &&
          <InsightsIndicatorDot />}
      </span>,
      keywords: ['app insights'],
      annotation: <IconLock narrow />,
      path: PATH_ADMIN_INSIGHTS,
    }, {
      label: 'Stats',
      keywords: ['backend orchestrator processors worker status logs'],
      annotation: <IconLock narrow />,
      path: PATH_ADMIN_STATS,
    });
    if (canManageConfiguration) { adminSection.items.push({
      label: appText.admin.appConfig,
      annotation: <IconLock narrow />,
      path: PATH_ADMIN_CONFIGURATION,
    }); }
    if (areAdminDebugToolsEnabled) {
      adminSection.items.push({
        label: 'Baseline Overview',
        annotation: <BiLockAlt />,
        path: PATH_ADMIN_BASELINE,
      }, {
        label: 'Components Overview',
        annotation: <BiLockAlt />,
        path: PATH_ADMIN_COMPONENTS,
      });
    }
    if (canManageUsers) {
      adminSection.items.push({
        label: 'Manage Users',
        annotation: <IconLock narrow />,
        path: PATH_ADMIN_USERS,
      });
    }
  }
  if (isUserSignedIn) {
    adminSection.items.push({
      label: appText.auth.signOut,
      action: async () => {
        setIsOpen?.(false);
        try {
          await fetch('/api/logout', {
            method: 'POST',
            credentials: 'same-origin',
          });
        } finally {
          clearAuthStateAndRedirectIfNecessary?.();
        }
      },
    });
  } else {
    adminSection.items.push({
      label: appText.auth.signIn,
      path: PATH_SIGN_IN,
    });
  }

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
      // Radix renders the dialog content in a portal. Keep that portal above
      // sticky navigation, hover surfaces, and the video mini-player; without
      // an explicit positioned layer the input can receive focus while the
      // panel itself is visually covered on mobile.
      label={DIALOG_TITLE}
      overlayClassName="fixed inset-0 z-[2190]"
      contentClassName="fixed inset-0 z-[2200] pointer-events-auto"
      filter={(value, search, keywords) => {
        const searchFormatted = search.trim().toLocaleLowerCase();
        return (
          value.toLocaleLowerCase().includes(searchFormatted) ||
          keywords?.some(keyword => keyword.includes(searchFormatted))
        ) ? 1 : 0 ;
      }}
      loop
    >
      <Modal
        anchor='top'
        className="rounded-[12px]!"
        onClose={() => setIsOpen?.(false)}
        noPadding
        fast
        disablePortal
      >
        <VisuallyHidden.Root>
          <DialogTitle>{DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{DIALOG_DESCRIPTION}</DialogDescription>
        </VisuallyHidden.Root>
        <div className={clsx(
          'flex items-center justify-center gap-2',
          'py-1 px-4.5',
          'rounded-none bg-transparent',
          'border-b border-b-gray-400/25 dark:border-b-gray-800',
        )}>
          <Command.Input
            ref={refInput}
            value={queryLiveRaw}
            onValueChange={value => {
              setQueryLiveRaw(value);
              updateMask();
            }}
            className={clsx(
              'grow p-0',
              'focus:ring-0',
              'border-transparent focus:border-transparent',
              'bg-transparent rounded-none',
              'placeholder:text-gray-400/80',
              'dark:placeholder:text-gray-700',
              'focus:outline-hidden',
              isPending && 'opacity-20',
            )}
            placeholder={appText.cmdk.placeholder}
            disabled={isPending}
          />
          {canManageUsers &&
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setQueryLiveRaw(current => {
                  const trimmed = current.trim();
                  return trimmed.toLocaleLowerCase().startsWith('users:')
                    ? trimmed.slice('users:'.length).trimStart()
                    : `users: ${trimmed}`;
                })}
                className={clsx(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  isUserSearchLive
                    ? 'border-main text-main'
                    : 'border-gray-400/40 text-dim',
                )}
              >
                Users
              </button>
              {isUserSearchLive && userRole === 'superadmin' && [
                ['user', 'Users'],
                ['admin', 'Admins'],
                ['superadmin', 'Super admins'],
              ].map(([role, label]) =>
                <button
                  key={role}
                  type="button"
                  onClick={() => setQueryLiveRaw(`users:${role} `)}
                  className={clsx(
                    'rounded-full border px-2 py-0.5',
                    'text-[11px] text-dim max-sm:hidden',
                    'border-gray-400/40',
                  )}
                >
                  {label}
                </button>)}
            </div>}
          {isLoading && !isPending
            ? <span className="translate-y-[2px]">
              <Spinner size={16} className="-mr-1" />
            </span>
            : <span>
              <LoaderButton
                className={clsx(
                  'h-auto! py-1 mr-[-9px]',
                  'px-1',
                  'text-[12px]',
                  'text-gray-400/90 dark:text-gray-700',
                )}
                onClick={() => {
                  if (queryLiveRaw) {
                    setQueryLiveRaw('');
                    updateMask();
                  } else {
                    setIsOpen?.(false);
                  }
                }}
              >
                {queryLiveRaw
                  ? <IoClose size={17} className="text-dim" />
                  : <>
                    <span className="sm:hidden">
                      <IoClose size={17} className="text-dim" />
                    </span>
                    <span className="max-sm:hidden mx-0.5">
                      ESC
                    </span>
                  </>}
              </LoaderButton>
            </span>}
        </div>
        <Command.List
          ref={refScroll}
          onScroll={updateMask}
          className="overflow-y-auto"
          style={{ ...styleMask, maxHeight }}
        >
          <div className="flex flex-col pt-2 pb-3 px-3 gap-2">
            <Command.Empty className="mt-1 px-2 text-dim text-[0.9rem] pb-0.5">
              {isLoading
                ? appText.cmdk.searching
                : appText.cmdk.noResults}
            </Command.Empty>
            {queriedSections
              .concat(categorySections)
              .concat(librarySections)
              .concat(sortSection)
              .concat(sectionPages)
              .concat(adminSection)
              .concat(clientSections)
              .filter(({ items }) => items.length > 0)
              .map(({ heading, accessory, items }) =>
                <Command.Group
                  key={heading}
                  heading={<div className={clsx(
                    'flex items-center',
                    'px-2 py-1',
                    'text-xs font-medium text-dim tracking-wider',
                    isPending && 'opacity-20',
                  )}>
                    {accessory &&
                      <div className="w-5">{accessory}</div>}
                    {heading}
                  </div>}
                  className={clsx(
                    'uppercase',
                    'select-none',
                  )}
                >
                  {items.map(({
                    label,
                    explicitKey,
                    keywords,
                    accessory,
                    annotation,
                    annotationAria,
                    path,
                    action,
                  }) => {
                    const key = `${heading} ${explicitKey ?? label}`;
                    return <CommandKItem
                      key={key}
                      label={label}
                      value={key}
                      keywords={keywords}
                      onSelect={() => {
                        if (action) {
                          const result = action();
                          if (result instanceof Promise) {
                            setKeyWaiting(key);
                            setIsWaitingForAction(true);
                            result.then(shouldClose => {
                              shouldCloseAfterWaiting.current =
                                shouldClose === true;
                              setIsWaitingForAction(false);
                            });
                          } else {
                            if (!path) { setIsOpen?.(false); }
                          }
                        }
                        if (path) {
                          if (path !== pathname) {
                            setKeyWaiting(key);
                            shouldCloseAfterWaiting.current = true;
                            startTransition(() => router.push(path));
                          } else {
                            setIsOpen?.(false);
                          }
                        }
                      }}
                      accessory={accessory}
                      annotation={annotation}
                      annotationAria={annotationAria}
                      loading={key === keyWaiting}
                      disabled={isPending && key !== keyWaiting}
                    />;
                  })}
                </Command.Group>)}
            {footer && !queryLive &&
              <div className={clsx(
                'text-center text-base text-dim pt-1',
                'pb-2',
              )}>
                {footer}
              </div>}
          </div>
        </Command.List>
      </Modal>
    </Command.Dialog>
  );
}
