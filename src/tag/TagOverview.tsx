import { Media, MediaDateRangePostgres } from '@/media';
import TagHeader from './TagHeader';
import MediaGridContainer from '@/media/MediaGridContainer';

export default function TagOverview({
  tag,
  photos,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  tag: string,
  photos: Media[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `tag-${tag}`,
      photos,
      count,
      tag,
      header: <TagHeader {...{
        tag,
        photos,
        count,
        dateRange,
      }} />,
      animateOnFirstLoadOnly,
    }} />
  );
}
