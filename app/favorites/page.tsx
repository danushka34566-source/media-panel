import { redirect } from 'next/navigation';
import EntityLink from '@/components/entity/EntityLink';
import IconFavs from '@/components/icons/IconFavs';
import MediaGridContainer from '@/media/MediaGridContainer';
import MediaHeader from '@/media/MediaHeader';
import { descriptionForMediaSet } from '@/media';
import { getMediaNoStore } from '@/media/cache';
import { auth } from '@/auth/server';
import { getUserFavoriteMediaIds } from '@/auth/users';
import { PATH_FAVORITES, PATH_SIGN_IN } from '@/app/path';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getAppText } from '@/i18n/state/server';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.status !== 'active') {
    redirect(PATH_SIGN_IN);
  }

  const ids = await getUserFavoriteMediaIds(session.user.id);
  const photos = ids.length
    ? await getMediaNoStore({ ids, limit: ids.length })
    : [];
  const appText = await getAppText();

  return (
    <MediaGridContainer
      cacheKey="personal-favorites"
      photos={photos}
      count={photos.length}
      header={<MediaHeader
        photos={photos}
        count={photos.length}
        entity={<EntityLink
          label="Favorites"
          path={PATH_FAVORITES}
          icon={<IconFavs size={13} highlight />}
          contrast="high"
          hoverType="none"
        />}
        entityDescription={descriptionForMediaSet(
          photos,
          appText,
          'saved media',
          false,
          photos.length,
        )}
        hasAiTextGeneration={AI_CONTENT_GENERATION_ENABLED}
      />}
    />
  );
}
