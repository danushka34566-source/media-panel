import AnimateItems from '@/components/AnimateItems';
import { Media } from '.';
import MediaLarge from './MediaLarge';
import { RevalidateMedia } from './InfiniteMediaScroll';

export default function MediaListLarge({
  photos,
  animate = true,
  prefetchFirstMediaLinks,
  onLastMediaVisible,
  revalidateMedia,
  animateOnFirstLoadOnly = false,
}: {
  photos: Media[]
  animate?: boolean
  prefetchFirstMediaLinks?: boolean
  onLastMediaVisible?: () => void
  revalidateMedia?: RevalidateMedia
  animateOnFirstLoadOnly?: boolean
}) {
  return (
    <AnimateItems
      className="space-y-1"
      type={animate ? 'scale' : 'none'}
      fade={false}
      duration={0.7}
      staggerDelay={0.15}
      distanceOffset={0}
      staggerOnFirstLoadOnly
      animateOnFirstLoadOnly={animateOnFirstLoadOnly}
      removeTransformAfterAnimation
      items={photos.map((photo, index) =>
        <MediaLarge
          key={photo.id}
          photo={photo}
          priority={index === 0}
          // Keep the first posters immediate. Remaining rows are promoted
          // when they approach the viewport in MediaLarge.
          initiallyLoadPreviewImage={index < 2}
          preloadFullVideoDownload
          prefetch={index < 3}
          prefetchRelatedLinks={prefetchFirstMediaLinks && index === 0}
          revalidateMedia={revalidateMedia}
          shouldZoomOnFKeydown={false}
          onVisible={index === photos.length - 1
            ? onLastMediaVisible
            : undefined}
        />)}
      itemKeys={photos.map(photo => photo.id)}
    />
  );
}
