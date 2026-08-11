import { Media } from '../media';
import ImageCaption from '@/image-response/components/ImageCaption';
import ImageMediaGrid from '@/image-response/components/ImageMediaGrid';
import ImageContainer from '@/image-response/components/ImageContainer';
import MediaFilmIcon from 
  '@/film/MediaFilmIcon';
import { NextImageSize } from '@/platforms/next-image';
import { labelForFilm } from '@/film';

export default function FilmImageResponse({
  film,
  photos,
  width,
  height,
  fontFamily,
}: {
  film: string,
  photos: Media[]
  width: NextImageSize
  height: number
  fontFamily: string
}) {  
  return (
    <ImageContainer solidBackground={photos.length === 0}>
      <ImageMediaGrid
        {...{
          photos,
          width,
          height,
        }}
      />
      <ImageCaption {...{
        width,
        height,
        fontFamily,
        icon: <MediaFilmIcon
          film={film}
          height={height * .081}
          style={{ transform: `translateY(${height * .001}px)`}}
        />,
        title: labelForFilm(film).medium.toLocaleUpperCase(),
      }} />
    </ImageContainer>
  );
}
