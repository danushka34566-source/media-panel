'use client';

import useSwrInfinite from 'swr/infinite';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppGrid from '@/components/AppGrid';
import Spinner from '@/components/Spinner';
import { getMediaPageAction } from '@/media/actions';
import { Media } from '.';
import type { MediaPage } from './query';
import { MediaSetCategory } from '../category';
import { clsx } from 'clsx/lite';
import useVisibility from '@/utility/useVisibility';
import { SortBy } from './sort';
import { SWR_KEYS } from '@/swr';
import { useAppText } from '@/i18n/state/client';
import {
  hasMediaScrollAnchor,
  useMediaFeedRestorationAnchor,
} from './useMediaScrollRestoration';

const SIZE_KEY_SEPARATOR = '__';
const getSizeFromKey = (key: string) =>
  Number(key.slice(key.lastIndexOf(SIZE_KEY_SEPARATOR) + SIZE_KEY_SEPARATOR.length));

// Keep the pages already seen in this tab across a detail-route unmount. A
// saved page count alone makes SWR rebuild each page before the clicked card
// exists, so scroll restoration visibly advances through the feed.
const MAX_REMEMBERED_FEEDS = 8;
const rememberedFeedPages = new Map<string, MediaPage[]>();

const rememberFeedPages = (key: string, pages: MediaPage[]) => {
  if (pages.length === 0) { return; }
  rememberedFeedPages.delete(key);
  rememberedFeedPages.set(key, pages);
  while (rememberedFeedPages.size > MAX_REMEMBERED_FEEDS) {
    const oldestKey = rememberedFeedPages.keys().next().value;
    if (typeof oldestKey !== 'string') { break; }
    rememberedFeedPages.delete(oldestKey);
  }
};

export type RevalidateMedia = (
  photoId: string,
  revalidateRemainingMedia?: boolean,
) => Promise<any>;

export default function InfiniteMediaScroll({
  cacheKey,
  initialOffset,
  itemsPerPage,
  sortBy,
  sortWithPriority,
  excludeFromFeeds,
  query,
  excludeIds,
  album,
  category,
  contentType,
  performer,
  recent,
  studio,
  year,
  camera,
  lens,
  tag,
  recipe,
  film,
  focal,
  wrapMoreButtonInGrid,
  coalescePages = false,
  loadAheadViewports = 2,
  startImmediately = false,
  useCachedMedia = true,
  restoreCachedPagesOnRemount = false,
  includeHiddenMedia,
  includeMissingStorageStatus,
  children,
}: {
  initialOffset: number
  itemsPerPage: number
  sortBy?: SortBy
  sortWithPriority?: boolean
  excludeFromFeeds?: boolean
  query?: string
  excludeIds?: string[]
  cacheKey: string
  wrapMoreButtonInGrid?: boolean
  coalescePages?: boolean
  loadAheadViewports?: number
  startImmediately?: boolean
  useCachedMedia?: boolean
  restoreCachedPagesOnRemount?: boolean
  includeHiddenMedia?: boolean
  includeMissingStorageStatus?: boolean
  children: (props: {
    key: string
    photos: Media[]
    onLastMediaVisible?: () => void
    revalidateMedia?: RevalidateMedia
  }) => ReactNode
} & MediaSetCategory) {
  const excludedIdsKey = excludeIds?.join(',') ?? 'none';
  const snapshotKey = JSON.stringify({
    cacheKey, initialOffset, itemsPerPage, sortBy, sortWithPriority,
    excludeFromFeeds, query, camera, lens, tag, recipe, film, focal,
    album, category, contentType, performer, recent, studio, year,
    includeHiddenMedia, includeMissingStorageStatus,
  });
  const feedKey = `${snapshotKey}-exclude-${excludedIdsKey}`;
  const rememberedPages = restoreCachedPagesOnRemount
    ? rememberedFeedPages.get(feedKey)
    : undefined;
  const initialPageCountRef = useRef(Math.max(1, rememberedPages?.length ?? 0));
  const [hasStartedLoading, setHasStartedLoading] = useState(
    startImmediately || Boolean(rememberedPages?.length),
  );
  
  const { utility } = useAppText();

  const keyGenerator = useCallback(
    (size: number, prev: MediaPage | null) => {
      if (!hasStartedLoading || (prev && !prev.hasMore)) { return null; }
      return `${SWR_KEYS.INFINITE_MEDIA_SCROLL}-${feedKey}${SIZE_KEY_SEPARATOR}${size}`;
    }, [feedKey, hasStartedLoading]);

  const fetcher = useCallback(async (keyWithSize: string) => {
    const pageIndex = getSizeFromKey(keyWithSize);
    try {
      const page = await getMediaPageAction({
        offset: initialOffset + pageIndex * itemsPerPage,
        sortBy,
        sortWithPriority,
        excludeFromFeeds,
        query,
        excludeIds,
        limit: itemsPerPage,
        hidden: includeHiddenMedia ? 'include' : 'exclude',
        includeMissingStorageStatus,
        album, category, contentType, performer, recent, studio, year,
        camera,
        lens,
        tag,
        recipe,
        film,
        focal,
      }, useCachedMedia);
      failedPageIndicesRef.current.delete(pageIndex);
      return page;
    } catch (error) {
      failedPageIndicesRef.current.add(pageIndex);
      throw error;
    }
  }, [
    useCachedMedia,
    sortBy,
    sortWithPriority,
    excludeFromFeeds,
    query,
    excludeIds,
    initialOffset,
    itemsPerPage,
    includeHiddenMedia,
    includeMissingStorageStatus,
    album, category, contentType, performer, recent, studio, year,
    camera,
    lens,
    tag,
    recipe,
    film,
    focal,
  ]);

  const { data, isLoading, isValidating, error, mutate, setSize } =
    useSwrInfinite<MediaPage>(
      keyGenerator,
      fetcher,
      {
        initialSize: initialPageCountRef.current,
        fallbackData: rememberedPages,
        persistSize: true,
        revalidateFirstPage: false,
        // A long full-page feed may contain hundreds of already-rendered
        // pages. Revalidating every page on focus/reconnect creates a burst
        // of server actions when a mobile browser resumes and can take down
        // the route. New pages are fetched FIFO; an explicit retry handles a
        // failed page without refetching the whole feed.
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
        dedupingInterval: 30_000,
        keepPreviousData: true,
      },
    );

  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const loadingPageRef = useRef(false);
  const queuedAdvanceRef = useRef(false);
  const failedPageIndicesRef = useRef(new Set<number>());
  const [isMoreButtonVisible, setIsMoreButtonVisible] = useState(false);
  const restorationAnchor = useMediaFeedRestorationAnchor(cacheKey);
  
  const isLoadingOrValidating = isLoading || isValidating;
  const loadAheadPx = typeof window === 'undefined'
    ? 800
    : Math.max(800, window.innerHeight * loadAheadViewports);

  const pages = useMemo(
    () => (data ?? []).filter((page): page is MediaPage => Boolean(page)),
    [data],
  );

  useEffect(() => {
    if (restoreCachedPagesOnRemount && pages.length > 0) {
      rememberFeedPages(feedKey, pages.map(page => ({
        ...page, photos: [...page.photos],
      })));
    }
  }, [pages, restoreCachedPagesOnRemount, feedKey]);

  const renderedPages = useMemo(() => {
    const seenStorageUrls = new Set<string>();
    return pages.map(({ photos }) => photos.filter(photo => {
      const storageUrl = photo.url.toLowerCase();
      if (seenStorageUrls.has(storageUrl)) { return false; }
      seenStorageUrls.add(storageUrl);
      return true;
    }));
  }, [pages]);

  const displayPages = useMemo(() => coalescePages
    ? [renderedPages.flat()]
    : renderedPages,
  [coalescePages, renderedPages]);

  const isFinished = pages.at(-1)?.hasMore === false;
  useEffect(() => {
    if (!isFinished || error || isLoadingOrValidating) { return; }
    window.dispatchEvent(new CustomEvent('media-feed-exhausted', {
      detail: { cacheKey, feedKey, href: window.location.href },
    }));
  }, [cacheKey, feedKey, error, isFinished, isLoadingOrValidating]);

  const advance = useCallback(() => {
    if (
      error ||
      isFinished
    ) {
      return;
    }
    // A fast gesture can cross the sentinel while the previous page is still
    // in flight. Keep one bounded request queued instead of dropping the
    // signal and leaving the user at the end of the rendered feed.
    if (isLoadingOrValidating || loadingPageRef.current) {
      queuedAdvanceRef.current = true;
      return;
    }
    loadingPageRef.current = true;
    Promise.resolve(setSize(pages.length + 1)).catch(() => undefined);
  }, [error, isFinished, isLoadingOrValidating, setSize, pages.length]);

  useEffect(() => {
    if (isLoadingOrValidating) { return; }
    const hadQueuedAdvance = queuedAdvanceRef.current;
    queuedAdvanceRef.current = false;
    loadingPageRef.current = false;
    if (hadQueuedAdvance && !isFinished && !error) { advance(); }
  }, [advance, error, isFinished, isLoadingOrValidating]);

  const retryFailedPage = useCallback(() => {
    if (loadingPageRef.current) { return; }
    loadingPageRef.current = true;
    Promise.resolve(mutate(undefined, {
      populateCache: false,
      revalidate: (_page, key) =>
        failedPageIndicesRef.current.has(getSizeFromKey(String(key))),
    })).catch(() => undefined);
  }, [mutate]);

  const revalidateMedia: RevalidateMedia = useCallback((
    photoId: string,
    revalidateRemainingMedia?: boolean,
  ) => mutate(data, {
    revalidate: (_page: MediaPage | undefined, key: string) => {
      const i = (data ?? []).findIndex(page =>
        page?.photos.some(photo => photo.id === photoId));
      const size = getSizeFromKey(String(key));
      return revalidateRemainingMedia ? size >= i : size === i;
    },
  } as any), [data, mutate]);

  useVisibility({
    ref: buttonContainerRef,
    rootMargin: `${loadAheadPx}px 0px`,
    onVisible: () => {
      setIsMoreButtonVisible(true);
      setHasStartedLoading(true);
    },
    onHidden: () => setIsMoreButtonVisible(false),
  });

  useEffect(() => {
    if (isMoreButtonVisible && !isFinished) {
      advance();
    }
  }, [advance, isFinished, isMoreButtonVisible]);

  useEffect(() => {
    if (!restorationAnchor || error || isFinished || isLoadingOrValidating ||
      hasMediaScrollAnchor(restorationAnchor)) { return; }
    if (!hasStartedLoading) {
      // Keep the feed loaded after the external anchor request is fulfilled.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasStartedLoading(true);
    } else if (pages.length > 0 && !loadingPageRef.current) {
      advance();
    }
  }, [
    advance, error, hasStartedLoading, isFinished, isLoadingOrValidating,
    pages.length, restorationAnchor,
  ]);

  const renderMoreButton =
    <div ref={buttonContainerRef}>
      <button
        type="button"
        onClick={() => {
          if (!hasStartedLoading) {
            setHasStartedLoading(true);
          } else if (error) {
            retryFailedPage();
          } else {
            advance();
          }
        }}
        disabled={isLoadingOrValidating}
        aria-busy={isLoadingOrValidating}
        aria-label={isLoadingOrValidating ? utility.loadMore : undefined}
        className={clsx(
          'w-full flex justify-center',
          isLoadingOrValidating && 'subtle',
        )}
      >
        {isLoadingOrValidating
          ? <Spinner size={20} />
          : error ? utility.tryAgain : utility.loadMore}
      </button>
    </div>;

  return (
    <>
      {displayPages.map((photos, index) => (
        children({
          key: coalescePages ? `${cacheKey}-continuous` : `${cacheKey}-${index}`,
          photos, 
          onLastMediaVisible: index === displayPages.length - 1
            ? advance
            : undefined,
          revalidateMedia,
        })
      ))}
      {!isFinished && <div className="mt-4">
        {wrapMoreButtonInGrid
          ? <AppGrid contentMain={renderMoreButton} />
          : renderMoreButton}
      </div>}
    </>
  );
}
