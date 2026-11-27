'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import MediaLarge from './MediaLarge';

type MediaLargeProps = ComponentProps<typeof MediaLarge>;
type MediaDetailSwipePaths = Pick<
  MediaLargeProps, 'swipePreviousPath' | 'swipeNextPath'
>;

export default function MediaDetailHero({
  deferredSwipePaths,
  ...props
}: MediaLargeProps & { deferredSwipePaths?: Promise<MediaDetailSwipePaths> }) {
  const [resolved, setResolved] = useState<{
    source: Promise<MediaDetailSwipePaths>
    paths: MediaDetailSwipePaths
  }>();

  useEffect(() => {
    if (!deferredSwipePaths) { return; }
    let active = true;
    void deferredSwipePaths.then(paths => {
      if (active) { setResolved({ source: deferredSwipePaths, paths }); }
    }, () => undefined);
    return () => { active = false; };
  }, [deferredSwipePaths]);

  return <MediaLarge
    {...props}
    {...(resolved && resolved.source === deferredSwipePaths
      ? resolved.paths
      : undefined)}
  />;
}
