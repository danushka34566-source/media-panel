import { Media } from '@/media';
import ImageCaption from '../image-response/components/ImageCaption';
import ImageMediaGrid from '../image-response/components/ImageMediaGrid';
import ImageContainer from '../image-response/components/ImageContainer';
import { NextImageSize } from '@/platforms/next-image';
import IconRecents from '@/components/icons/IconRecents';

export default function RecentsImageResponse({
  title,
  photos,
  width,
  height,
  fontFamily,
}: {
  title: string
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
        icon: <IconRecents
          size={height * .08}
          style={{
            transform: `translateY(${height * .003}px)`,
            marginRight: height * .01,
          }}
        />,
        title,
      }} />
    </ImageContainer>
  );
}
