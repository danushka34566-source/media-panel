'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { SelectMediaContext } from './SelectMediaState';
import { PARAM_SELECT, PATH_GRID_INFERRED } from '@/app/path';
import { usePathname, useRouter } from 'next/navigation';
import { useAppState } from '@/app/AppState';
import useClientSearchParams from '@/utility/useClientSearchParams';
import { replacePathWithEvent } from '@/utility/url';
import { isElementPartiallyInViewport } from '@/utility/dom';

export const DATA_KEY_MEDIA_GRID = 'data-photo-grid';

export default function SelectMediaProvider({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter();

  const pathname = usePathname();

  const { canEdit } = useAppState();
  
  const searchParamsSelect = useClientSearchParams(
    PARAM_SELECT,
    // Only scan urls when admin is signed in
    canEdit,
  );

  const [canCurrentPageSelectMedia, setCanCurrentPageSelectMedia] =
    useState(false);
  const [selectionRedirectPending, setSelectionRedirectPending] =
    useState(false);
  const [selectedMediaIds, setSelectedMediaIds] =
    useState<string[]>([]);
  const [selectableMediaIds, setSelectableMediaIds] = useState<string[]>([]);
  const [isPerformingSelectEdit, setIsPerformingSelectEdit] =
    useState(false);

  const getMediaGridElements = useCallback(() =>
    document.querySelectorAll(`[${DATA_KEY_MEDIA_GRID}=true]`)
  , []);

  const syncSelectableMedia = useCallback(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>(
      `[${DATA_KEY_MEDIA_GRID}=true] [data-preview-id]`,
    ))
      .map(element => element.dataset.previewId)
      .filter((id): id is string => Boolean(id));
    const uniqueIds = [...new Set(ids)];
    setSelectableMediaIds(current =>
      current.length === uniqueIds.length &&
      current.every((id, index) => id === uniqueIds[index])
        ? current
        : uniqueIds,
    );
    setCanCurrentPageSelectMedia(current => {
      const next = getMediaGridElements().length > 0;
      return current === next ? current : next;
    });
  }, [getMediaGridElements]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const observer = new MutationObserver(syncSelectableMedia);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = window.requestAnimationFrame(syncSelectableMedia);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname, canEdit, syncSelectableMedia]);

  const isSelectingMedia = useMemo(() =>
    canEdit &&
    (searchParamsSelect === 'true' || selectionRedirectPending)
  , [canEdit, searchParamsSelect, selectionRedirectPending]);
    
  const startSelectingMedia = useCallback(() => {
    // The DOM is the source of truth at click time. React state can still be
    // one render behind while a type page's grid is mounting.
    const canSelectCurrentPage = getMediaGridElements().length > 0;

    // Use replacePathWithEvent because only query params change.
    if (canSelectCurrentPage) {
      replacePathWithEvent(`${pathname}?${PARAM_SELECT}=true`);
      return;
    }

    // Full view and non-grid pages use the shared Grid selection surface.
    setSelectionRedirectPending(true);
    router.push(`${PATH_GRID_INFERRED}?${PARAM_SELECT}=true`);
  }, [getMediaGridElements, pathname, router]);
  
  const stopSelectingMedia = useCallback(() => {
    setSelectionRedirectPending(false);
    replacePathWithEvent(pathname);
  }, [pathname]);

  useEffect(() => {
    if (isSelectingMedia) {
      const photoGrids = Array.from(getMediaGridElements());
      const isSomeMediaGridVisible = photoGrids
        .some(element => isElementPartiallyInViewport(element, -20));
      if (!isSomeMediaGridVisible) {
        photoGrids[0]?.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedMediaIds([]);
    }
  }, [isSelectingMedia, getMediaGridElements]);

  return (
    <SelectMediaContext.Provider value={{
      canCurrentPageSelectMedia,
      isSelectingMedia,
      startSelectingMedia,
      stopSelectingMedia,
      selectedMediaIds,
      setSelectedMediaIds,
      selectableMediaIds,
      selectAllMedia: () => setSelectedMediaIds(selectableMediaIds),
      clearSelectedMedia: () => setSelectedMediaIds([]),
      isPerformingSelectEdit,
      setIsPerformingSelectEdit,
    }}>
      {children}
    </SelectMediaContext.Provider>
  );
}
