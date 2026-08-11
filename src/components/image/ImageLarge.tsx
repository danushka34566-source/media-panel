import { IMAGE_QUALITY } from '@/app/config';
import { IMAGE_WIDTH_LARGE, CustomImageProps } from '.';
import ImageWithFallback from './ImageWithFallback';

export default function ImageLarge(props: CustomImageProps) {
  const {
    aspectRatio,
    blurCompatibilityMode,
    ...rest
  } = props;
  return (
    <ImageWithFallback {...{
      ...rest,
      blurCompatibilityLevel: blurCompatibilityMode ? 'high' : 'none',
      width: IMAGE_WIDTH_LARGE,
      height: Math.round(IMAGE_WIDTH_LARGE / aspectRatio),
      quality: IMAGE_QUALITY,
      sizes: rest.sizes ??
        '(max-width: 768px) 100vw, (max-width: 1280px) 75vw, 1000px',
    }} />
  );
};
