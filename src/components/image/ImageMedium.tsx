import { IMAGE_WIDTH_MEDIUM, CustomImageProps } from '.';
import ImageWithFallback from './ImageWithFallback';

export default function ImageMedium(props: CustomImageProps) {
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
      width: IMAGE_WIDTH_MEDIUM,
      height: Math.round(IMAGE_WIDTH_MEDIUM / aspectRatio),
      sizes: rest.sizes ??
        '(max-width: 480px) 50vw, (max-width: 768px) 25vw, ' +
        '(max-width: 1024px) 33vw, 25vw',
    }} />
  );
};
