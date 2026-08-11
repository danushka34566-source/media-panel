import type { Media } from '../media';
import ImageCaption from '@/image-response/components/ImageCaption';
import ImageMediaGrid from '@/image-response/components/ImageMediaGrid';
import ImageContainer from '@/image-response/components/ImageContainer';
import type { NextImageSize } from '@/platforms/next-image';
import { Album } from '.';
import IconAlbum from '@/components/icons/IconAlbum';

export default function AlbumImageResponse({
  album,
  photos,
  width,
  height,
  fontFamily,
}: {
  album: Album,
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
        icon: <IconAlbum
          size={height * .07}
          style={{
            transform: `translateY(${height * .004}px)`,
            marginRight: height * .03,
          }}
        />,
        title: album.title.toLocaleUpperCase(),
      }} />
    </ImageContainer>
  );
}
