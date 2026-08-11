import { Media, MediaDateRangePostgres } from '@/media';
import RecentsHeader from './RecentsHeader';
import MediaGridContainer from '@/media/MediaGridContainer';

export default function RecentsOverview({
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: 'recents', 
      photos,
      count,
      recent: true,
      header: <RecentsHeader {...{
        photos,
        count,
        dateRange,
      }} />,
      animateOnFirstLoadOnly,
    }} />
  );
}
