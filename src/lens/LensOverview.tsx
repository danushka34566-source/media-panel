import { Media, MediaDateRangePostgres } from '@/media';
import { Lens, createLensKey } from '.';
import LensHeader from './LensHeader';
import MediaGridContainer from '@/media/MediaGridContainer';

export default function LensOverview({
  lens,
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  lens: Lens,
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `lens-${createLensKey(lens)}`,
      photos,
      count,
      lens,
      animateOnFirstLoadOnly,
      header: <LensHeader {...{
        lens,
        photos,
        count,
        dateRange,
      }} />,
    }} />
  );
}
