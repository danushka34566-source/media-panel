'use client';

import { usePersonalFavoriteIds } from '@/auth/usePersonalFavorite';
import IconFavs from '@/components/icons/IconFavs';
import EntityLink, {
  EntityLinkExternalProps,
} from '@/components/entity/EntityLink';
import { PATH_FAVORITES } from '@/app/path';

export default function PersonalFavoritesLink(
  props: EntityLinkExternalProps,
) {
  const {
    data: favoriteIds,
    isUserSignedIn,
  } = usePersonalFavoriteIds();

  if (!isUserSignedIn || !favoriteIds?.length) { return null; }

  return (
    <EntityLink
      {...props}
      label="Favorites"
      path={PATH_FAVORITES}
      icon={<IconFavs size={13} highlight />}
      hoverCount={favoriteIds.length}
      hoverType="none"
    />
  );
}
