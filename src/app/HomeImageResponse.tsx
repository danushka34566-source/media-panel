import { NAV_TITLE } from '@/app/config';
import { Media } from '../media';
import ImageCaption from '@/image-response/components/ImageCaption';
import ImageContainer from '@/image-response/components/ImageContainer';
import ImageMediaGrid from '@/image-response/components/ImageMediaGrid';
import { NextImageSize } from '@/platforms/next-image';

export default function HomeImageResponse({
  photos,
  width,
  height,
  fontFamily,
}: {
  photos: Media[]
  width: NextImageSize
  height: number
  fontFamily: string
}) {
  return (
    <ImageContainer>
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
        title: NAV_TITLE,
      }} />
    </ImageContainer>
  );
}
