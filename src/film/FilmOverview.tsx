import { Media, MediaDateRangePostgres } from '@/media';
import FilmHeader from './FilmHeader';
import MediaGridContainer from '@/media/MediaGridContainer';

export default function FilmOverview({
  film,
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  film: string,
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `film-${film}`, 
      photos,
      count,
      film,
      header: <FilmHeader {...{
        film,
        photos,
        count,
        dateRange,
      }} />,
      animateOnFirstLoadOnly,
    }} />
  );
}
