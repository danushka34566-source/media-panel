import MediaCamera from '@/camera/MediaCamera';
import { MediaSetCategories } from '@/category';
import MaskedScroll from '@/components/MaskedScroll';
import MediaAlbum from '@/album/MediaAlbum';
import MediaTag from '@/tag/MediaTag';
import PersonalFavoritesLink from './PersonalFavoritesLink';
import clsx from 'clsx/lite';
import { CATEGORY_VISIBILITY } from '@/app/config';
import MediaRecents from '@/recents/MediaRecents';
import MediaFilm from '@/film/MediaFilm';
import MediaFocalLength from '@/focal/MediaFocalLength';
import MediaLens from '@/lens/MediaLens';
import MediaRecipe from '@/recipe/MediaRecipe';
import LoaderButton from '@/components/primitives/LoaderButton';
import { useAppState } from '@/app/AppState';
import { ComponentProps, useMemo } from 'react';
import EntityLink from '@/components/entity/EntityLink';
import { useAppText } from '@/i18n/state/client';
import { getTopEntities } from '@/category/mobile';
import { BiExpandVertical } from 'react-icons/bi';

const ENTITY_LINK_PROPS: Partial<ComponentProps<typeof EntityLink>> = {
  badged: true,
  badgeType: 'medium',
  truncate: false,
};

export default function TopMediaEntities({
  className,
  ...categories
}: MediaSetCategories & {
  className?: string
}) {
  const { setIsCommandKOpen } = useAppState();

  const { utility } = useAppText();

  const {
    hasRecents,
    albums,
    tags,
    camera,
    lens,
    recipe,
    film,
    focal,
  } = useMemo(() => getTopEntities(categories), [categories]);

  return (
    <MaskedScroll
      direction="horizontal"
      className={clsx(
        'flex whitespace-nowrap gap-x-3',
        // Prevent shadow clipping
        'py-1',
        className,
      )}
      fadeSize={50}
    >
      <PersonalFavoritesLink {...ENTITY_LINK_PROPS} />
      {hasRecents &&
        <MediaRecents
          key="recents"
          {...ENTITY_LINK_PROPS}
        />}
      {albums.map(({ album }) =>
        <MediaAlbum
          key={album.id}
          album={album}
          {...ENTITY_LINK_PROPS}
        />,
      )}
      {tags.map(({ tag }) =>
        <MediaTag
          key={tag}
          tag={tag}
          {...ENTITY_LINK_PROPS}
        />,
      )}
      {CATEGORY_VISIBILITY
        .map(category => {
          switch (category) {
            case 'cameras': return camera &&
              <MediaCamera
                key="cameras"
                camera={camera}
                {...ENTITY_LINK_PROPS}
              />;
            case 'lenses': return lens &&
              <MediaLens
                key="lenses"
                lens={lens}
                {...ENTITY_LINK_PROPS}
              />;
            case 'recipes': return recipe &&
              <MediaRecipe
                key="recipes"
                recipe={recipe}
                {...ENTITY_LINK_PROPS}
              />;
            case 'films': return film &&
              <MediaFilm
                key="films"
                film={film}
                {...ENTITY_LINK_PROPS}
              />;
            case 'focal-lengths': return focal &&
              <MediaFocalLength
                key="focal-lengths"
                focal={focal}
                {...ENTITY_LINK_PROPS}
              />;
          }
        })}
      <LoaderButton
        icon={<BiExpandVertical
          className="text-medium translate-y-[0.75px] text-[0.9rem]"
        />}
        onClick={() => setIsCommandKOpen?.(true)}
        hideText="never"
        className={clsx(
          'h-auto pt-[5px] pb-1.5 pl-1 pr-2.5',
          'gap-x-[3px] uppercase tracking-wide',
        )}
      >
        {utility.more}
      </LoaderButton>
    </MaskedScroll>
  );
}
