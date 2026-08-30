'use client';

import { usePersonalFavoriteIds } from '@/auth/usePersonalFavorite';
import IconFavs from '@/components/icons/IconFavs';
import EntityLink from '@/components/entity/EntityLink';
import { PATH_FAVORITES } from '@/app/path';
import { TAG_FAVS } from '@/tag';

export default function PersonalFavoriteBadge({
  mediaId,
}: {
  mediaId: string
}) {
  const { data: favoriteIds, isUserSignedIn } = usePersonalFavoriteIds();
  const isFavorite = Boolean(favoriteIds?.includes(mediaId));

  if (!isUserSignedIn || !isFavorite) { return null; }

  return (
    <EntityLink
      label={TAG_FAVS}
      path={PATH_FAVORITES}
      icon={<IconFavs
        size={13}
        className="translate-x-[-0.5px] translate-y-[-0.5px]"
        highlight
      />}
      iconBadgeEnd={<IconFavs
        size={10}
        className="translate-y-[-0.5px]"
        highlight
      />}
      contrast="medium"
      hoverType="none"
      hoverCount={favoriteIds?.length ?? 0}
      className="shrink-0"
    />
  );
}
