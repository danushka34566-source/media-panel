import { Media, shouldShowExifDataForMedia } from '../media';
import { AiFillApple } from 'react-icons/ai';
import ImageCaption from '@/image-response/components/ImageCaption';
import ImageMediaGrid from '@/image-response/components/ImageMediaGrid';
import ImageContainer from '@/image-response/components/ImageContainer';
import { OG_TEXT_BOTTOM_ALIGNMENT } from '@/app/config';
import { NextImageSize } from '@/platforms/next-image';
import { cameraFromMedia, formatCameraText } from '@/camera';

export default function MediaImageResponse({
  photo,
  width,
  height,
  fontFamily,
  isNextImageReady = true,
}: {
  photo: Media
  width: NextImageSize
  height: number
  fontFamily: string
  isNextImageReady: boolean
}) {
  const caption = [
    photo.model
      ? formatCameraText(cameraFromMedia(photo), 'short')
      : undefined,
    photo.focalLengthFormatted,
    photo.fNumberFormatted,
    photo.isoFormatted,
  ]
    .join(' ')
    .trim();

  return (
    <ImageContainer>
      <ImageMediaGrid {...{
        photos: isNextImageReady ? [photo] : [],
        width,
        height,
        ...OG_TEXT_BOTTOM_ALIGNMENT && { imagePosition: 'top' },
      }} />
      {shouldShowExifDataForMedia(photo) &&
        <ImageCaption {...{
          width,
          height,
          fontFamily,
          ...photo.make === 'Apple' && { icon: <AiFillApple style={{
            marginRight: height * .01,
          }} /> },
          title: caption,
        }} />}
    </ImageContainer>
  );
};
