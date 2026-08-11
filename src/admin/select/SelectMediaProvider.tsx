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
  const [selectedMediaIds, setSelectedMediaIds] =
    useState<string[]>([]);
  const [isPerformingSelectEdit, setIsPerformingSelectEdit] =
    useState(false);

  const getMediaGridElements = useCallback(() =>
    document.querySelectorAll(`[${DATA_KEY_MEDIA_GRID}=true]`)
  , []);

  useEffect(() => {
    if (canEdit) {
      const doesPageHaveMediaGrids = getMediaGridElements().length > 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanCurrentPageSelectMedia(doesPageHaveMediaGrids);
    }
  }, [pathname, canEdit, getMediaGridElements]);

  const isSelectingMedia = useMemo(() =>
    canEdit &&
    searchParamsSelect === 'true'
  , [canEdit, searchParamsSelect]);
    
  const startSelectingMedia = useCallback(() =>
    canCurrentPageSelectMedia
      // Use replacePathWithEvent because only query params change
      ? replacePathWithEvent(`${pathname}?${PARAM_SELECT}=true`)
      // Redirect to grid if current view does not support photo selection
      : router.push(`${PATH_GRID_INFERRED}?${PARAM_SELECT}=true`)
  , [router, canCurrentPageSelectMedia, pathname]);
  
  const stopSelectingMedia = useCallback(() =>
    replacePathWithEvent(pathname)
  , [pathname]);

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
      isPerformingSelectEdit,
      setIsPerformingSelectEdit,
    }}>
      {children}
    </SelectMediaContext.Provider>
  );
}
