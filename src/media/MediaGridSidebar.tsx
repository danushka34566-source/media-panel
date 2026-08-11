'use client';

import MediaCamera from '@/camera/MediaCamera';
import HeaderList from '@/components/HeaderList';
import MediaTag from '@/tag/MediaTag';
import { photoQuantityText } from '.';
import {
  TAG_FAVS,
  TAG_PRIVATE,
  addPrivateToTags,
  limitTagsByCount,
} from '@/tag';
import MediaFilm from '@/film/MediaFilm';
import MediaFavs from '../tag/MediaFavs';
import { useAppState } from '@/app/AppState';
import { useMemo, useRef } from 'react';
import MediaPrivate from '@/tag/MediaPrivate';
import {
  CATEGORY_VISIBILITY,
  HIDE_TAGS_WITH_ONE_MEDIA,
} from '@/app/config';
import { clsx } from 'clsx/lite';
import MediaRecipe from '@/recipe/MediaRecipe';
import IconCamera from '@/components/icons/IconCamera';
import IconRecipe from '@/components/icons/IconRecipe';
import IconTag from '@/components/icons/IconTag';
import IconFilm from '@/components/icons/IconFilm';
import IconLens from '@/components/icons/IconLens';
import MediaLens from '@/lens/MediaLens';
import IconFocalLength from '@/components/icons/IconFocalLength';
import {
  getCategoriesWithItemsCount,
  MediaSetCategories,
} from '@/category';
import MediaFocalLength from '@/focal/MediaFocalLength';
import useElementHeight from '@/utility/useElementHeight';
import { useAppText } from '@/i18n/state/client';
import IconYear from '@/components/icons/IconYear';
import MediaYear from '@/year/MediaYear';
import { chunkArray } from '@/utility/array';
import MediaRecents from '@/recents/MediaRecents';
import IconAlbum from '@/components/icons/IconAlbum';
import MediaAlbum from '@/album/MediaAlbum';

const APPROXIMATE_ITEM_HEIGHT = 40;
const ABOUT_HEIGHT_OFFSET = 24;

export default function MediaGridSidebar({
  photosCount,
  containerHeight,
  aboutTextSafelyParsedHtml,
  aboutTextHasBrParagraphBreaks,
  className,
  ..._categories
}: MediaSetCategories & {
  photosCount: number
  containerHeight?: number
  aboutTextSafelyParsedHtml?: string
  aboutTextHasBrParagraphBreaks?: boolean
  className?: string
}) {
  const categories = useMemo(() => HIDE_TAGS_WITH_ONE_MEDIA
    ? {
      ..._categories,
      tags: limitTagsByCount(_categories.tags, 2),
    }
    : _categories
  , [_categories]);

  const {
    recents,
    years,
    cameras,
    lenses,
    albums,
    tags,
    films,
    recipes,
    focalLengths,
  } = categories;

  const yearRows = useMemo(() => chunkArray(years, 3), [years]);

  const categoriesCount = getCategoriesWithItemsCount(
    CATEGORY_VISIBILITY,
    categories,
  );

  const appText = useAppText();

  const aboutRef = useRef<HTMLParagraphElement>(null);
  const aboutHeight = useElementHeight(aboutRef);
  const height = containerHeight
    ? containerHeight - (aboutHeight ? aboutHeight + ABOUT_HEIGHT_OFFSET : 0)
    : undefined;

  const maxItemsPerCategory = height
    ? Math.max(
      Math.floor(height / categoriesCount / APPROXIMATE_ITEM_HEIGHT),
      // Always show at least 2 items
      2,
    )
    : undefined;

  const { photosCountHidden } = useAppState();

  const tagsIncludingHidden = useMemo(() =>
    addPrivateToTags(tags, photosCountHidden)
  , [tags, photosCountHidden]);

  const recentsContent = recents.length > 0
    ? <HeaderList
      key="recents"
      items={[<MediaRecents
        key="recents"
        hoverCount={recents[0]?.count}
        type="text-only"
        prefetch={false}
        contrast="low"
        badged
      />]}
    />
    : null;

  const yearsContent = years.length > 0
    ? <HeaderList
      key="years"
      title={appText.category.yearPlural}
      icon={<IconYear
        size={13}
        className="translate-x-[0.5px]"
      />}
      maxItems={maxItemsPerCategory}
      items={yearRows.map((row, index) =>
        <div key={index} className="flex gap-[5px]">
          {row.map(({ year, count }) =>
            <MediaYear
              key={year}
              year={year}
              hoverCount={count}
              type="text-only"
              prefetch={false}
              contrast="low"
              hoverType="image"
              suppressSpinner
              badged
            />)}
        </div>)}
    />
    : null;

  const camerasContent = cameras.length > 0
    ? <HeaderList
      key="cameras"
      title={appText.category.cameraPlural}
      icon={<IconCamera
        size={14}
        className="translate-x-[1px]"
      />}
      maxItems={maxItemsPerCategory}
      items={cameras
        .map(({ cameraKey, camera, count }) =>
          <MediaCamera
            key={cameraKey}
            camera={camera}
            type="text-only"
            hoverCount={count}
            prefetch={false}
            contrast="low"
            badged
          />)}
    />
    : null;

  const lensesContent = lenses.length > 0
    ? <HeaderList
      key="lenses"
      title={appText.category.lensPlural}
      icon={<IconLens size={15} />}
      maxItems={maxItemsPerCategory}
      items={lenses
        .map(({ lensKey, lens, count }) =>
          <MediaLens
            key={lensKey}
            lens={lens}
            type="text-only"
            hoverCount={count}
            prefetch={false}
            contrast="low"
            badged
          />)}
    />
    : null;

  const albumsContent = albums.length > 0
    ? <HeaderList
      key="albums"
      title={appText.category.albumPlural}
      icon={<IconAlbum
        size={13.5}
        className="translate-x-[1.5px]"
      />}
      maxItems={maxItemsPerCategory}
      items={albums
        .map(({ album, count }) =>
          <div key={album.slug} className="flex gap-1">
            <MediaAlbum
              key={album.slug}
              album={album}
              type="text-only"
              prefetch={false}
              contrast="low"
              hoverCount={count}
              badged
            />
          </div>)}
    />
    : null;

  const tagsContent = tags.length > 0
    ? <HeaderList
      key="tags"
      title={appText.category.tagPlural}
      icon={<IconTag
        size={13.5}
        className="translate-x-[1.5px] translate-y-[1px]"
      />}
      maxItems={maxItemsPerCategory}
      items={tagsIncludingHidden
        .map(({ tag, count }) => {
          switch (tag) {
            case TAG_FAVS:
              return <MediaFavs
                key={TAG_FAVS}
                hoverCount={count}
                type="icon-last"
                prefetch={false}
                contrast="low"
                badged
              />;
            case TAG_PRIVATE:
              return <MediaPrivate
                key={TAG_PRIVATE}
                type="icon-last"
                prefetch={false}
                contrast="low"
                badged
              />;
            default:
              return <MediaTag
                key={tag}
                tag={tag}
                hoverCount={count}
                type="text-only"
                prefetch={false}
                contrast="low"
                badged
              />;
          }
        })}
    />
    : null;

  const recipesContent = recipes.length > 0
    ? <HeaderList
      key="recipes"
      title={appText.category.recipePlural}
      icon={<IconRecipe
        size={16}
        className="translate-x-[-1px]"
      />}
      maxItems={maxItemsPerCategory}
      items={recipes
        .map(({ recipe, count }) =>
          <MediaRecipe
            key={recipe}
            recipe={recipe}
            type="text-only"
            hoverCount={count}
            prefetch={false}
            contrast="low"
            badged
          />)}
    />
    : null;

  const filmsContent = films.length > 0
    ? <HeaderList
      key="films"
      title={appText.category.filmPlural}
      icon={<IconFilm size={15} />}
      maxItems={maxItemsPerCategory}
      items={films
        .map(({ film, count }) =>
          <MediaFilm
            key={film}
            film={film}
            hoverCount={count}
            type="text-only"
            prefetch={false}
          />)}
    />
    : null;

  const focalLengthsContent = focalLengths.length > 0
    ? <HeaderList
      key="focal-lengths"
      title={appText.category.focalLengthPlural}
      icon={<IconFocalLength size={13} />}
      maxItems={maxItemsPerCategory}
      items={focalLengths.map(({ focal, count }) =>
        <MediaFocalLength
          key={focal}
          focal={focal}
          hoverCount={count}
          type="text-only"
          prefetch={false}
          badged
        />)}
    />
    : null;

  const photoStatsContent = photosCount > 0
    ? <HeaderList
      key="photo-stats"
      items={[photoQuantityText(photosCount, appText, false)]}
    />
    : null;

  return (
    <div className={clsx('space-y-4', className)}>
      {aboutTextSafelyParsedHtml && <HeaderList
        items={[<p
          key="about"
          ref={aboutRef}
          className={clsx(
            'max-w-60 normal-case text-dim [&>a]:underline',
            aboutTextHasBrParagraphBreaks && 'pb-2',
          )}
          dangerouslySetInnerHTML={{
            __html: aboutTextSafelyParsedHtml,
          }}
        />]}
      />}
      {CATEGORY_VISIBILITY.map(category => {
        switch (category) {
          case 'recents': return recentsContent;
          case 'years': return yearsContent;
          case 'cameras': return camerasContent;
          case 'lenses': return lensesContent;
          case 'albums': return albumsContent;
          case 'tags': return tagsContent;
          case 'recipes': return recipesContent;
          case 'films': return filmsContent;
          case 'focal-lengths': return focalLengthsContent;
        }
      })}
      {photoStatsContent}
    </div>
  );
}
