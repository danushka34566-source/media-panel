'use client';

import { Media } from '@/media';
import MediaOGTile from './MediaOGTile';

export default function StaggeredOgMedia({
  photos,
  onLastMediaVisible,
}: {
  photos: Media[]
  maxConcurrency?: number
  onLastMediaVisible?: () => void
}) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) =>
        <MediaOGTile
          key={photo.id}
          photo={photo}
          onVisible={index === photos.length - 1
            ? onLastMediaVisible
            : undefined}
          riseOnHover
        />)}
    </div>
  );
};
