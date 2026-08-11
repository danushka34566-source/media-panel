'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useAppState } from '@/app/AppState';
import {
  getPersonalFavoriteIdsAction,
  setPersonalFavoriteAction,
} from './actions';

const PERSONAL_FAVORITES_KEY = 'PERSONAL_FAVORITES';

const updateFavoriteIds = (
  ids: string[] | undefined,
  mediaId: string,
  isFavorite: boolean,
) => isFavorite
  ? Array.from(new Set([mediaId, ...(ids ?? [])]))
  : (ids ?? []).filter(id => id !== mediaId);

export default function usePersonalFavorite(mediaId?: string) {
  const { isUserSignedIn, userEmail } = useAppState();
  const [isMutating, setIsMutating] = useState(false);
  const [optimisticState, setOptimisticState] = useState<{
    mediaId: string
    value: boolean
  }>();
  const { data, isLoading, mutate } = useSWR(
    isUserSignedIn
      ? [PERSONAL_FAVORITES_KEY, userEmail]
      : null,
    () => getPersonalFavoriteIdsAction(),
  );
  const favoriteFromCache = Boolean(mediaId && data?.includes(mediaId));
  const isFavorite = optimisticState && optimisticState.mediaId === mediaId
    ? optimisticState.value
    : favoriteFromCache;

  const toggle = useCallback(async () => {
    if (!mediaId || !isUserSignedIn || isMutating) { return; }
    const previousValue = isFavorite;
    const nextValue = !previousValue;
    setOptimisticState({ mediaId, value: nextValue });
    setIsMutating(true);
    void mutate(
      (currentIds?: string[]) => updateFavoriteIds(
        currentIds,
        mediaId,
        nextValue,
      ),
      { revalidate: false },
    );
    try {
      const confirmedValue = await setPersonalFavoriteAction(
        mediaId,
        nextValue,
      );
      await mutate(
        (currentIds?: string[]) => updateFavoriteIds(
          currentIds,
          mediaId,
          confirmedValue,
        ),
        { revalidate: false },
      );
    } catch {
      await mutate(
        (currentIds?: string[]) => updateFavoriteIds(
          currentIds,
          mediaId,
          previousValue,
        ),
        { revalidate: false },
      );
    } finally {
      setOptimisticState(undefined);
      setIsMutating(false);
    }
  }, [isFavorite, isMutating, isUserSignedIn, mediaId, mutate]);

  return {
    isFavorite,
    isLoading: Boolean(isLoading || isMutating),
    isReady: data !== undefined,
    isUserSignedIn: Boolean(isUserSignedIn),
    toggle,
  };
}
