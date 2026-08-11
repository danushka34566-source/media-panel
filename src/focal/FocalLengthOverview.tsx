import { Media, MediaDateRangePostgres } from '@/media';
import MediaGridContainer from '@/media/MediaGridContainer';
import FocalLengthHeader from './FocalLengthHeader';

export default function FocalLengthOverview({
  focal,
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  focal: number,
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `focal-${focal}`,
      photos,
      count,
      focal,
      header: <FocalLengthHeader {...{
        focal,
        photos,
        count,
        dateRange,
      }} />,
      animateOnFirstLoadOnly,
    }} />
  );
}
