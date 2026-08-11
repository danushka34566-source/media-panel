import { Media, MediaDateRangePostgres } from '@/media';
import YearHeader from './YearHeader';
import MediaGridContainer from '@/media/MediaGridContainer';

export default function YearOverview({
  year,
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  year: string,
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `year-${year}`, 
      photos,
      count,
      year,
      header: <YearHeader {...{
        year,
        photos,
        count,
        dateRange,
      }} />,
      animateOnFirstLoadOnly,
    }} />
  );
} 