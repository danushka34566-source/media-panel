'use client';

import usePersonalFavorite from '@/auth/usePersonalFavorite';
import IconFavs from '@/components/icons/IconFavs';
import EntityLink from '@/components/entity/EntityLink';
import { PATH_FAVORITES } from '@/app/path';

export default function PersonalFavoriteBadge({
  mediaId,
}: {
  mediaId: string
}) {
  const {
    isFavorite,
    isReady,
    isUserSignedIn,
  } = usePersonalFavorite(mediaId);

  if (!isUserSignedIn || !isReady || !isFavorite) { return null; }

  return (
    <EntityLink
      label="Favorites"
      path={PATH_FAVORITES}
      icon={<IconFavs size={13} highlight />}
      contrast="medium"
      hoverType="none"
      className="shrink-0"
    />
  );
}
