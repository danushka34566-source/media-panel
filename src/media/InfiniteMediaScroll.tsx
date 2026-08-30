'use client';

import useSwrInfinite from 'swr/infinite';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppGrid from '@/components/AppGrid';
import Spinner from '@/components/Spinner';
import { getMediaCachedAction, getMediaAction } from '@/media/actions';
import { Media } from '.';
import { MediaSetCategory } from '../category';
import { clsx } from 'clsx/lite';
import useVisibility from '@/utility/useVisibility';
import { SortBy } from './sort';
import { SWR_KEYS } from '@/swr';
import { useAppText } from '@/i18n/state/client';

const SIZE_KEY_SEPARATOR = '__';
const getSizeFromKey = (key: string) =>
  parseInt(key.split(SIZE_KEY_SEPARATOR)[1]);

// SWR retains fetched page payloads while the root provider remains mounted,
// but useSWRInfinite forgets its size when a public feed unmounts for a media
// detail route. Remember only the number of in-memory pages so Back can read
// those cached payloads immediately. This is deliberately not persisted to
// browser storage: a reload starts from the normal bounded first page.
const MAX_REMEMBERED_FEEDS = 32;
const rememberedFeedPageCounts = new Map<string, number>();

const rememberFeedPageCount = (key: string, count: number) => {
  if (count <= 0) { return; }
  rememberedFeedPageCounts.delete(key);
  rememberedFeedPageCounts.set(key, count);
  while (rememberedFeedPageCounts.size > MAX_REMEMBERED_FEEDS) {
    const oldestKey = rememberedFeedPageCounts.keys().next().value;
    if (typeof oldestKey !== 'string') { break; }
    rememberedFeedPageCounts.delete(oldestKey);
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
  camera,
  lens,
  tag,
  recipe,
  film,
  focal,
  wrapMoreButtonInGrid,
  coalescePages = false,
  loadAheadViewports = 2,
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
  const feedKey = `${cacheKey}-${sortBy ?? 'default'}-${sortWithPriority ? 'priority' : 'plain'}-exclude-${excludedIdsKey}`;
  const rememberedPageCountRef = useRef(
    restoreCachedPagesOnRemount
      ? rememberedFeedPageCounts.get(feedKey) ?? 0
      : 0,
  );
  const [hasStartedLoading, setHasStartedLoading] = useState(
    rememberedPageCountRef.current > 0,
  );
  
  const { utility } = useAppText();

  const keyGenerator = useCallback(
    (size: number, prev: Media[]) => {
      if (!hasStartedLoading || (prev && prev.length === 0)) { return null; }
      return `${SWR_KEYS.INFINITE_MEDIA_SCROLL}-${feedKey}${SIZE_KEY_SEPARATOR}${size}`;
    }, [feedKey, hasStartedLoading]);

  const fetcher = useCallback((
    keyWithSize: string,
    warmOnly?: boolean,
  ) =>
    (useCachedMedia ? getMediaCachedAction : getMediaAction)({
      offset: initialOffset + getSizeFromKey(keyWithSize) * itemsPerPage,
      sortBy, 
      sortWithPriority,
      excludeFromFeeds,
      query,
      excludeIds,
      limit: itemsPerPage,
      hidden: includeHiddenMedia ? 'include' : 'exclude',
      includeMissingStorageStatus,
      camera,
      lens,
      tag,
      recipe,
      film,
      focal,
    }, warmOnly)
  , [
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
    camera,
    lens,
    tag,
    recipe,
    film,
    focal,
  ]);

  const { data, isLoading, isValidating, error, mutate, setSize } =
    useSwrInfinite<Media[]>(
      keyGenerator,
      fetcher,
      {
        initialSize: Math.max(1, rememberedPageCountRef.current),
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
  const [isMoreButtonVisible, setIsMoreButtonVisible] = useState(false);
  
  const isLoadingOrValidating = isLoading || isValidating;
  const loadAheadPx = typeof window === 'undefined'
    ? 800
    : Math.max(800, window.innerHeight * loadAheadViewports);

  const pages = useMemo(
    () => (data ?? []).filter((page): page is Media[] => Array.isArray(page)),
    [data],
  );

  useEffect(() => {
    if (restoreCachedPagesOnRemount && pages.length > 0) {
      rememberFeedPageCount(feedKey, pages.length);
    }
  }, [feedKey, pages.length, restoreCachedPagesOnRemount]);

  const renderedPages = useMemo(() => {
    const seenIds = new Set<string>();
    return pages.map(page => page.filter(photo => {
      if (seenIds.has(photo.id)) { return false; }
      seenIds.add(photo.id);
      return true;
    }));
  }, [pages]);

  const displayPages = useMemo(() => coalescePages
    ? [renderedPages.flat()]
    : renderedPages,
  [coalescePages, renderedPages]);

  const isFinished = useMemo(() =>
    Boolean(pages.length > 0 && pages[pages.length - 1]!.length < itemsPerPage),
  [pages, itemsPerPage]);

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
    loadingPageRef.current = true;
    Promise.resolve(mutate(undefined, {
      revalidate: (_page: Media[] | undefined, key: string) =>
        getSizeFromKey(String(key)) === pages.length - 1,
    } as any)).catch(() => undefined);
  }, [mutate, pages.length]);

  const revalidateMedia: RevalidateMedia = useCallback((
    photoId: string,
    revalidateRemainingMedia?: boolean,
  ) => mutate(data, {
    revalidate: (_data: Media[], key: string) => {
      const i = (data ?? []).findIndex(photos =>
        photos.some(photo => photo.id === photoId));
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

  const renderMoreButton =
    <div ref={buttonContainerRef}>
      <button
        type="button"
        onClick={() => error ? retryFailedPage() : advance()}
        disabled={isLoading || isValidating}
        className={clsx(
          'w-full flex justify-center',
          isLoadingOrValidating && 'subtle',
        )}
      >
        {error
          ? utility.tryAgain
          : isLoadingOrValidating
            ? <Spinner size={20} />
            : utility.loadMore}
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
