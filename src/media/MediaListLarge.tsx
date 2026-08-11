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
}: {
  photos: Media[]
  animate?: boolean
  prefetchFirstMediaLinks?: boolean
  onLastMediaVisible?: () => void
  revalidateMedia?: RevalidateMedia
}) {
  return (
    <AnimateItems
      className="space-y-1"
      type={animate ? 'scale' : 'none'}
      duration={0.7}
      staggerDelay={0.15}
      distanceOffset={0}
      staggerOnFirstLoadOnly
      items={photos.map((photo, index) =>
        <MediaLarge
          key={photo.id}
          photo={photo}
          priority={index === 0}
          initiallyLoadPreviewImage={index < 2}
          prefetch={index === 0 ? true : undefined}
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
