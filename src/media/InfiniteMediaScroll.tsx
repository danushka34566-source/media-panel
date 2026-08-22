'use client';

import useSwrInfinite from 'swr/infinite';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppGrid from '@/components/AppGrid';
import Spinner from '@/components/Spinner';
import { getMediaCachedAction, getMediaAction } from '@/media/actions';
import { Media } from '.';
import { MediaSetCategory } from '../category';
import { clsx } from 'clsx/lite';
import { useAppState } from '@/app/AppState';
import useVisibility from '@/utility/useVisibility';
import { SortBy } from './sort';
import { SWR_KEYS } from '@/swr';
import { useAppText } from '@/i18n/state/client';

const SIZE_KEY_SEPARATOR = '__';
const getSizeFromKey = (key: string) =>
  parseInt(key.split(SIZE_KEY_SEPARATOR)[1]);

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
  camera,
  lens,
  tag,
  recipe,
  film,
  focal,
  wrapMoreButtonInGrid,
  loadAheadViewports = 1,
  useCachedMedia = true,
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
  cacheKey: string
  wrapMoreButtonInGrid?: boolean
  loadAheadViewports?: number
  useCachedMedia?: boolean
  includeHiddenMedia?: boolean
  includeMissingStorageStatus?: boolean
  children: (props: {
    key: string
    photos: Media[]
    onLastMediaVisible?: () => void
    revalidateMedia?: RevalidateMedia
  }) => ReactNode
} & MediaSetCategory) {
  const { isUserSignedIn } = useAppState();
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  
  const { utility } = useAppText();

  const keyGenerator = useCallback(
    (size: number, prev: Media[]) => {
      if (!hasStartedLoading || (prev && prev.length === 0)) { return null; }
      return `${SWR_KEYS.INFINITE_MEDIA_SCROLL}-${cacheKey}-${sortBy ?? 'default'}-${sortWithPriority ? 'priority' : 'plain'}${SIZE_KEY_SEPARATOR}${size}`;
    }, [cacheKey, hasStartedLoading, sortBy, sortWithPriority]);

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
        initialSize: 1,
        revalidateFirstPage: false,
        revalidateOnFocus: Boolean(isUserSignedIn),
        revalidateOnReconnect: Boolean(isUserSignedIn),
      },
    );

  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const loadingPageRef = useRef(false);
  const [isMoreButtonVisible, setIsMoreButtonVisible] = useState(false);
  
  const isLoadingOrValidating = isLoading || isValidating;
  const loadAheadPx = typeof window === 'undefined'
    ? 800
    : Math.max(800, window.innerHeight * loadAheadViewports);

  const pages = useMemo(
    () => (data ?? []).filter((page): page is Media[] => Array.isArray(page)),
    [data],
  );

  const renderedPages = useMemo(() => {
    const seenIds = new Set<string>();
    return pages.map(page => page.filter(photo => {
      if (seenIds.has(photo.id)) { return false; }
      seenIds.add(photo.id);
      return true;
    }));
  }, [pages]);

  const isFinished = useMemo(() =>
    Boolean(pages.length > 0 && pages[pages.length - 1]!.length < itemsPerPage),
  [pages, itemsPerPage]);

  const advance = useCallback(() => {
    if (
      error ||
      isFinished ||
      isLoadingOrValidating ||
      loadingPageRef.current
    ) {
      return;
    }
    loadingPageRef.current = true;
    Promise.resolve(setSize(pages.length + 1)).catch(() => undefined);
  }, [error, isFinished, isLoadingOrValidating, setSize, pages.length]);

  useEffect(() => {
    if (!isLoadingOrValidating) { loadingPageRef.current = false; }
  }, [isLoadingOrValidating]);

  const retryFailedPage = useCallback(() => {
    loadingPageRef.current = true;
    Promise.resolve(mutate(undefined, {
      revalidate: (_page: Media[] | undefined, key: [string, number]) =>
        key[1] === pages.length,
    } as any)).catch(() => undefined);
  }, [mutate, pages.length]);

  const revalidateMedia: RevalidateMedia = useCallback((
    photoId: string,
    revalidateRemainingMedia?: boolean,
  ) => mutate(data, {
    revalidate: (_data: Media[], [_, size]:[string, number]) => {
      const i = (data ?? []).findIndex(photos =>
        photos.some(photo => photo.id === photoId));
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
    if (isMoreButtonVisible && !isFinished && !isLoadingOrValidating) {
      advance();
    }
  }, [advance, isFinished, isLoadingOrValidating, isMoreButtonVisible]);

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
      {renderedPages.map((photos, index) => (
        children({
          key: `${cacheKey}-${index}`,
          photos, 
          onLastMediaVisible: index === renderedPages.length - 1
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
