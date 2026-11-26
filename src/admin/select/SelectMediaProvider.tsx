'use client';

import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react';
import { SelectMediaContext } from './SelectMediaState';
import { PARAM_SELECT, PATH_GRID_INFERRED } from '@/app/path';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAppState } from '@/app/AppState';
import { isElementPartiallyInViewport } from '@/utility/dom';

export const DATA_KEY_MEDIA_GRID = 'data-photo-grid';

// Isolate the query subscription so public pages can still be prerendered.
function SelectionQuery({ onChange }: { onChange: (selecting: boolean) => void }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    onChange(new URLSearchParams(query).get(PARAM_SELECT) === 'true');
  }, [pathname, query, onChange]);
  return null;
}

function updateSelectionParam(selecting: boolean) {
  const url = new URL(window.location.href);
  if (selecting) { url.searchParams.set(PARAM_SELECT, 'true'); }
  else { url.searchParams.delete(PARAM_SELECT); }
  if (url.href === window.location.href) { return; }
  if (selecting) {
    window.history.pushState({ mediaPanelSelection: true }, '', url);
  } else if (window.history.state?.mediaPanelSelection) {
    window.history.back();
  } else {
    // A deep link or a switch from full view has no underlying grid entry.
    window.history.replaceState(null, '', url);
  }
}

export default function SelectMediaProvider({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter();

  const pathname = usePathname();

  const { canEdit } = useAppState();
  
  const [selecting, setSelecting] = useState(false);
  const [canCurrentPageSelectMedia, setCanCurrentPageSelectMedia] =
    useState(false);
  const [selectedMediaIds, setSelectedMediaIds] =
    useState<string[]>([]);
  const [selectableMediaIds, setSelectableMediaIds] = useState<string[]>([]);
  const [isPerformingSelectEdit, setIsPerformingSelectEdit] =
    useState(false);

  const onSelectionRouteChange = useCallback((active: boolean) => {
    setSelecting(active);
    setSelectedMediaIds([]);
  }, []);

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

  const isSelectingMedia = canEdit && selecting;

  const startSelectingMedia = useCallback(() => {
    // The DOM is the source of truth at click time. React state can still be
    // one render behind while a type page's grid is mounting.
    const canSelectCurrentPage = getMediaGridElements().length > 0;

    if (canSelectCurrentPage) {
      updateSelectionParam(true);
      return;
    }

    // Full view and non-grid pages use the shared Grid selection surface.
    router.push(`${PATH_GRID_INFERRED}?${PARAM_SELECT}=true`);
  }, [getMediaGridElements, router]);
  
  const stopSelectingMedia = useCallback(() => {
    updateSelectionParam(false);
  }, []);

  useEffect(() => {
    if (isSelectingMedia) {
      const photoGrids = Array.from(getMediaGridElements());
      const isSomeMediaGridVisible = photoGrids
        .some(element => isElementPartiallyInViewport(element, -20));
      if (!isSomeMediaGridVisible) {
        photoGrids[0]?.scrollIntoView({ behavior: 'smooth' });
      }
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
      {canEdit && <Suspense fallback={null}>
        <SelectionQuery onChange={onSelectionRouteChange} />
      </Suspense>}
      {children}
    </SelectMediaContext.Provider>
  );
}
