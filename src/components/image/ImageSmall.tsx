import { IMAGE_WIDTH_SMALL, CustomImageProps } from '.';
import ImageWithFallback from './ImageWithFallback';

export default function ImageSmall(props: CustomImageProps) {
  const {
    aspectRatio,
    blurCompatibilityMode,
    ...rest
  } = props;
  return (
    <ImageWithFallback {...{
      ...rest,
      // Storage remains the reliable fallback when the image optimizer is
      // unavailable or over quota.
      fallbackToUnoptimized: rest.fallbackToUnoptimized ?? true,
      blurCompatibilityLevel: blurCompatibilityMode ? 'high' : 'none',
      width: IMAGE_WIDTH_SMALL,
      height: Math.round(IMAGE_WIDTH_SMALL / aspectRatio),
      sizes: rest.sizes ?? '50px',
    }} />
  );
};
