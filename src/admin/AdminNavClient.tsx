'use client';

import LinkWithIconLoader from '@/components/LinkWithIconLoader';
import Note from '@/components/Note';
import AppGrid from '@/components/AppGrid';
import Spinner from '@/components/Spinner';
import {
  PATH_ADMIN_INSIGHTS,
  PATH_ADMIN_STATS,
  PATH_ADMIN_ALBUMS,
  PATH_ADMIN_CATEGORIES,
  PATH_ADMIN_MEDIA,
  PATH_ADMIN_MEDIA_UPDATES,
  PATH_ADMIN_PROCESSING,
  PATH_ADMIN_RECIPES,
  PATH_ADMIN_TAGS,
  PATH_ADMIN_UPLOADS,
  PATH_ADMIN_USERS,
  checkPathPrefix,
  isPathAdminInfo,
  isPathTopLevelAdmin,
} from '@/app/path';
import { useAppState } from '@/app/AppState';
import { clsx } from 'clsx/lite';
import { differenceInMinutes } from 'date-fns';
import { usePathname, useRouter } from 'next/navigation';
import {
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FaRegClock } from 'react-icons/fa';
import AdminAppInfoIcon from './AdminAppInfoIcon';
import AdminInfoNav from './AdminInfoNav';
import LinkWithLoaderBackground from '@/components/LinkWithLoaderBackground';
import MaskedScroll from '@/components/MaskedScroll';
import { useAppText } from '@/i18n/state/client';
import { ADMIN_CREATE_USER_EVENT } from './users/events';
import { ADMIN_INFO_CONTENT_READY_EVENT } from './navigation-events';

// Updates from past 5 minutes considered recent
const areTimesRecent = (dates: Date[]) => dates
  .some(date => differenceInMinutes(new Date(), date) < 5);
const ACTIVE_ADMIN_REFRESH_INTERVAL_MS = 30_000;
const IDLE_ADMIN_REFRESH_INTERVAL_MS = 180_000;
const ADMIN_INFO_NAVIGATION_DELAY_MS = 1_000;
const ADMIN_INFO_LOADING_TIMEOUT_MS = 120_000;

export default function AdminNavClient({
  items,
  mostRecentMediaUpdateTime,
  includeInsights = true,
}: {
  items: {
    label: string,
    href: string,
    count: number,
  }[]
  mostRecentMediaUpdateTime?: Date
  includeInsights?: boolean
}) {
  const pathname = usePathname();
  const router = useRouter();
  const appText = useAppText();
  const adminInfoPath = includeInsights
    ? PATH_ADMIN_INSIGHTS
    : PATH_ADMIN_STATS;
  const [isAdminInfoLoading, setIsAdminInfoLoading] = useState(false);
  const adminInfoNavigationTimerRef = useRef<number | undefined>(undefined);
  const adminInfoLoadingTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const stopAdminInfoLoading = () => {
      setIsAdminInfoLoading(false);
      if (adminInfoLoadingTimerRef.current !== undefined) {
        window.clearTimeout(adminInfoLoadingTimerRef.current);
        adminInfoLoadingTimerRef.current = undefined;
      }
    };
    window.addEventListener(
      ADMIN_INFO_CONTENT_READY_EVENT,
      stopAdminInfoLoading,
    );
    return () => {
      window.removeEventListener(
        ADMIN_INFO_CONTENT_READY_EVENT,
        stopAdminInfoLoading,
      );
      if (adminInfoNavigationTimerRef.current !== undefined) {
        window.clearTimeout(adminInfoNavigationTimerRef.current);
      }
      if (adminInfoLoadingTimerRef.current !== undefined) {
        window.clearTimeout(adminInfoLoadingTimerRef.current);
      }
    };
  }, []);

  const onAdminInfoClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathname === adminInfoPath
    ) { return; }
    event.preventDefault();
    if (isAdminInfoLoading) { return; }
    setIsAdminInfoLoading(true);
    router.prefetch(adminInfoPath);
    adminInfoLoadingTimerRef.current = window.setTimeout(() => {
      adminInfoLoadingTimerRef.current = undefined;
      setIsAdminInfoLoading(false);
    }, ADMIN_INFO_LOADING_TIMEOUT_MS);
    adminInfoNavigationTimerRef.current = window.setTimeout(() => {
      adminInfoNavigationTimerRef.current = undefined;
      router.push(adminInfoPath);
    }, ADMIN_INFO_NAVIGATION_DELAY_MS);
  };

  const {
    adminUpdateTimes = [],
    startUpload,
    photosCountTotal,
    mediaCounts,
    albumsCount,
    categoriesCount,
    tagsCount,
    recipesCount,
    refreshAdminData,
    setShouldLoadAdminData,
    uploadState: {
      clientUploads,
    },
  } = useAppState();

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setShouldLoadAdminData?.(true),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [setShouldLoadAdminData]);

  const updateTimes = useMemo(() =>
    (mostRecentMediaUpdateTime ? [mostRecentMediaUpdateTime] : [])
      .concat(adminUpdateTimes)
  , [mostRecentMediaUpdateTime, adminUpdateTimes]);

  const [hasRecentUpdates, setHasRecentUpdates] =
    useState(areTimesRecent(updateTimes));

  useEffect(() => {
    // Check every 1 second if update times are recent
    const interval = setInterval(() =>
      setHasRecentUpdates(areTimesRecent(updateTimes))
    , 1_000);
    return () => clearInterval(interval);
  }, [updateTimes]);

  const shouldShowBanner =
    hasRecentUpdates &&
    isPathTopLevelAdmin(pathname) &&
    pathname !== PATH_ADMIN_MEDIA_UPDATES;
  const activeUploadCountFromClient = useMemo(() => {
    const uploadKeys = new Set<string>();
    clientUploads
      .filter(upload =>
        upload.status === 'queued' ||
        upload.status === 'uploading')
      .forEach(upload => uploadKeys.add(upload.id));
    return uploadKeys.size;
  }, [clientUploads]);
  const hasLiveAdminWork = hasRecentUpdates ||
    activeUploadCountFromClient > 0;
  const isUsersPage = checkPathPrefix(pathname, PATH_ADMIN_USERS);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void refreshAdminData?.();
    };

    const interval = window.setInterval(
      refresh,
      hasLiveAdminWork
        ? ACTIVE_ADMIN_REFRESH_INTERVAL_MS
        : IDLE_ADMIN_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [hasLiveAdminWork, refreshAdminData]);

  const navItems = useMemo(() => {
    const processingCount = items.find(item =>
      item.href === PATH_ADMIN_PROCESSING)?.count;
    const liveCountsByHref = new Map<string, number | undefined>([
      [PATH_ADMIN_MEDIA, photosCountTotal ?? mediaCounts?.total],
      [PATH_ADMIN_UPLOADS, activeUploadCountFromClient],
      [PATH_ADMIN_PROCESSING, processingCount],
      [PATH_ADMIN_ALBUMS, albumsCount],
      [PATH_ADMIN_CATEGORIES, categoriesCount],
      [PATH_ADMIN_TAGS, tagsCount],
      [PATH_ADMIN_RECIPES, recipesCount],
    ]);
    const itemsWithLiveCounts = items
      .map(item => ({
        ...item,
        count: liveCountsByHref.get(item.href) ?? item.count,
      }));
    const hasUploadsLink = itemsWithLiveCounts.some(({ href }) =>
      href === PATH_ADMIN_UPLOADS);
    if (
      hasUploadsLink ||
      (
        activeUploadCountFromClient === 0 &&
        !checkPathPrefix(pathname, PATH_ADMIN_UPLOADS)
      )
    ) {
      return itemsWithLiveCounts;
    }
    const uploadsItem = {
      label: appText.admin.uploadPlural,
      href: PATH_ADMIN_UPLOADS,
      count: activeUploadCountFromClient,
    };
    return [
      ...itemsWithLiveCounts.slice(0, 1),
      uploadsItem,
      ...itemsWithLiveCounts.slice(1),
    ];
  }, [
    activeUploadCountFromClient,
    albumsCount,
    categoriesCount,
    appText.admin.uploadPlural,
    items,
    mediaCounts?.total,
    pathname,
    photosCountTotal,
    recipesCount,
    tagsCount,
  ]);

  return (
    <AppGrid
      contentMain={
        <div className="space-y-4">
          <div className={clsx(
            'flex gap-2 pb-3',
            'border-b border-gray-200 dark:border-gray-800',
            'min-w-0',
          )}>
            <MaskedScroll
              className="grow min-w-0 -mx-1"
              direction="horizontal"
            >
              <div className={clsx(
                'flex min-w-max items-center gap-0.5 px-1',
                'md:gap-1.5',
              )}>
                {navItems.map(({ label, href, count }) =>
                  <LinkWithLoaderBackground
                    key={label}
                    href={href}
                    className={clsx(
                      'inline-flex shrink-0 whitespace-nowrap gap-0.5',
                      checkPathPrefix(pathname, href)
                        ? 'font-bold'
                        : 'text-dim',
                      'hover:text-main active:text-medium',
                    )}
                    prefetch={false}
                  >
                    <span>{label}</span>
                    {count > 0 &&
                      <span>({count})</span>}
                  </LinkWithLoaderBackground>)}
              </div>
            </MaskedScroll>
            <button
              type="button"
              onClick={() => {
                if (isUsersPage) {
                  window.dispatchEvent(new Event(ADMIN_CREATE_USER_EVENT));
                } else {
                  void startUpload?.();
                }
              }}
              aria-label={isUsersPage ? 'Add user' : 'Upload media'}
              title={isUsersPage ? 'Add user' : 'Upload media'}
              className={clsx(
                'relative inline-flex self-center items-center justify-center',
                'size-5! rounded-full border border-main',
                'bg-dim hover:bg-medium active:bg-extra-dim',
                'text-main shadow-sm',
                'transition-colors',
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute left-1/2 top-1/2 block h-[2px] w-2.5',
                  '-translate-x-1/2 -translate-y-1/2 rounded-full',
                  'bg-current',
                )}
              />
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute left-1/2 top-1/2 block h-2.5 w-[2px]',
                  '-translate-x-1/2 -translate-y-1/2 rounded-full',
                  'bg-current',
                )}
              />
            </button>
            <LinkWithIconLoader
              href={adminInfoPath}
              isLoading={isAdminInfoLoading}
              onClick={onAdminInfoClick}
              className={clsx(
                isPathAdminInfo(pathname)
                  ? 'font-bold'
                  : 'text-dim',
                'hover:text-main active:text-dim',
              )}
              icon={<AdminAppInfoIcon />}
              loader={<Spinner className="translate-y-[-0.75px]" />}
            />
          </div>
          {shouldShowBanner &&
            <Note icon={<FaRegClock className="shrink-0" />}>
              Media updates detected - they may take several minutes to show up
              for visitors
            </Note>}
          {isPathAdminInfo(pathname) &&
            <AdminInfoNav {...{ includeInsights }} />}
        </div>
      }
    />
  );
}
