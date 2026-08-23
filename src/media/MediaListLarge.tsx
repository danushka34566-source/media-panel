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
  optimizeLongList = false,
}: {
  photos: Media[]
  animate?: boolean
  prefetchFirstMediaLinks?: boolean
  onLastMediaVisible?: () => void
  revalidateMedia?: RevalidateMedia
  optimizeLongList?: boolean
}) {
  return (
    <AnimateItems
      className="space-y-1"
      type={animate ? 'scale' : 'none'}
      duration={0.7}
      staggerDelay={0.15}
      distanceOffset={0}
      staggerOnFirstLoadOnly
      classNameItem={optimizeLongList
        ? '[content-visibility:auto] [contain-intrinsic-size:900px]'
        : undefined}
      items={photos.map((photo, index) =>
        <MediaLarge
          key={photo.id}
          photo={photo}
          priority={index === 0}
          // Full-page rows mount every poster immediately; only the first two
          // are eager network requests. The rest use native lazy loading and
          // are already in the DOM before the reader reaches them.
          initiallyLoadPreviewImage={index < 2}
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
