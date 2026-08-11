import { Media } from '../media';
import ImageCaption from '@/image-response/components/ImageCaption';
import ImageMediaGrid from '@/image-response/components/ImageMediaGrid';
import ImageContainer from '@/image-response/components/ImageContainer';
import {
  Camera,
  cameraFromMedia,
  formatCameraText,
} from '@/camera';
import { NextImageSize } from '@/platforms/next-image';
import { AiFillApple } from 'react-icons/ai';
import IconCamera from '@/components/icons/IconCamera';
import { isCameraApple } from '@/platforms/apple';

export default function CameraImageResponse({
  camera: cameraProp,
  photos,
  width,
  height,
  fontFamily,
}: {
  camera: Camera
  photos: Media[]
  width: NextImageSize
  height: number
  fontFamily: string
}) {
  const camera = cameraFromMedia(photos[0], cameraProp);
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
        icon: isCameraApple(camera)
          ? <AiFillApple
            size={height * .09}
            style={{
              marginRight: height * .005,
              transform: `translateY(${-height * .002}px)`,
            }}
          />
          : <IconCamera
            size={height * .09}
            style={{
              marginRight: height * .015,
              transform: `translateY(${height * .001}px)`,
            }}
          />,
        title: formatCameraText(camera).toLocaleUpperCase(),
      }} />
    </ImageContainer>
  );
}
