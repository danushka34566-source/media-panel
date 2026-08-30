import AnimateItems from '@/components/AnimateItems';
import {
  Media,
  MediaDateRangePostgres,
  getMediaPosterUrl,
  getNextMedia,
  getPreviousMedia,
} from '.';
import { MediaSetCategory } from '../category';
import MediaLarge from './MediaLarge';
import AppGrid from '@/components/AppGrid';
import MediaDetailRelated from './MediaDetailRelated';
import TagHeader from '@/tag/TagHeader';
import CameraHeader from '@/camera/CameraHeader';
import FilmHeader from '@/film/FilmHeader';
import { TAG_PRIVATE } from '@/tag';
import PrivateHeader from '@/tag/PrivateHeader';
import FocalLengthHeader from '@/focal/FocalLengthHeader';
import MediaHeader from './MediaHeader';
import RecipeHeader from '@/recipe/RecipeHeader';
import { ReactNode } from 'react';
import LensHeader from '@/lens/LensHeader';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import YearHeader from '@/year/YearHeader';
import RecentsHeader from '@/recents/RecentsHeader';
import AlbumHeader from '@/album/AlbumHeader';
import { pathForMedia } from '@/app/path';
import MediaDetailScrollReset from './MediaDetailScrollReset';
import { preload } from 'react-dom';

export default function MediaDetailPage({
  photo,
  photos,
  photosGrid,
  recent,
  year,
  camera,
  lens,
  album,
  tag,
  category,
  studio,
  performer,
  contentType,
  film,
  recipe,
  focal,
  indexNumber,
  count,
  dateRange,
  shouldShare,
  includeFavoriteInAdminMenu,
  headerOverride,
}: {
  photo: Media
  photos: Media[]
  photosGrid?: Media[]
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
  shouldShare?: boolean
  includeFavoriteInAdminMenu?: boolean
  headerOverride?: ReactNode
} & MediaSetCategory) {
  const heroPosterSrc = getMediaPosterUrl(photo);
  if (heroPosterSrc) {
    preload(heroPosterSrc, { as: 'image', fetchPriority: 'high' });
  }

  let customHeader: ReactNode | undefined = headerOverride;

  if (customHeader) {
    // Use override when the caller provides a route-specific header.
  } else if (year) {
    customHeader = <YearHeader
      year={year}
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
    />;
  } else if (recent) {
    customHeader = <RecentsHeader
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
    />;
  } else if (camera) {
    customHeader = <CameraHeader
      camera={camera}
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
    />;
  } else if (lens) {
    customHeader = <LensHeader
      lens={lens}
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
    />;
  } else if (album) {
    customHeader = <AlbumHeader
      album={album}
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
    />;
  } else if (tag) {
    customHeader = tag === TAG_PRIVATE
      ? <PrivateHeader
        photos={photos}
        selectedMedia={photo}
        indexNumber={indexNumber}
        count={count ?? 0}
      />
      : <TagHeader
        key={tag}
        tag={tag}
        photos={photos}
        selectedMedia={photo}
        indexNumber={indexNumber}
        count={count}
        dateRange={dateRange}
      />;
  } else if (film) {
    customHeader = <FilmHeader
      film={film}
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
    />;
  } else if (recipe) {
    customHeader = <RecipeHeader
      recipe={recipe}
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
    />;
  } else if (focal) {
    customHeader = <FocalLengthHeader
      focal={focal}
      photos={photos}
      selectedMedia={photo}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
    />;
  }

  const previousMedia = getPreviousMedia(photo, photos);
  const nextMedia = getNextMedia(photo, photos);
  const categoryPathParams = {
    recent,
    year,
    camera,
    lens,
    album,
    tag,
    category,
    studio,
    performer,
    contentType,
    film,
    recipe,
    focal,
  };
  const swipePreviousPath = previousMedia
    ? pathForMedia({ photo: previousMedia, ...categoryPathParams })
    : undefined;
  const swipeNextPath = nextMedia
    ? pathForMedia({ photo: nextMedia, ...categoryPathParams })
    : undefined;

  return (
    <div>
      <MediaDetailScrollReset />
      <AppGrid
        className="mt-1.5 mb-6"
        contentMain={customHeader ?? <MediaHeader
          selectedMedia={photo}
          photos={photos}
          recipe={recipe}
          hasAiTextGeneration={AI_CONTENT_GENERATION_ENABLED}
        />}
      />
      <AnimateItems
        className="md:mb-8"
        animateFromAppState
        fade={false}
        removeTransformAfterAnimation
        items={[
          <MediaLarge
            key={photo.id}
            photo={photo}
            album={album}
            primaryTag={tag}
            camera={camera}
            lens={lens}
            tag={tag}
            category={category}
            studio={studio}
            performer={performer}
            contentType={contentType}
            film={film}
            recipe={recipe}
            focal={focal}
            priority
            preloadSubtitleManifest={false}
            broadcastDetailVideoPlayback
            mountPreviewOnlyWhenVisible={false}
            prefetchRelatedLinks
            recent={recent}
            year={year}
            showTitle={Boolean(customHeader)}
            showTitleAsH1
            showCamera={!camera}
            showLens={!lens}
            showFilm={!film}
            showRecipe={!recipe}
            shouldShare={shouldShare}
            shouldShareRecents={recent !== undefined}
            shouldShareYear={year !== undefined}
            shouldShareCamera={camera !== undefined}
            shouldShareLens={lens !== undefined}
            shouldShareAlbum={album !== undefined}
            shouldShareTag={tag !== undefined}
            shouldShareFilm={film !== undefined}
            shouldShareRecipe={recipe !== undefined}
            shouldShareFocalLength={focal !== undefined}
            includeFavoriteInAdminMenu={includeFavoriteInAdminMenu}
            showAdminKeyCommands
            swipePreviousPath={swipePreviousPath}
            swipeNextPath={swipeNextPath}
          />,
        ]}
      />
      <MediaDetailRelated
        photos={photosGrid ?? photos}
        selectedMedia={photo}
        {...categoryPathParams}
      />
    </div>
  );
}
