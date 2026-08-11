import { Media, MediaDateRangePostgres } from '@/media';
import MediaGridContainer from '@/media/MediaGridContainer';
import { Album } from '.';
import AlbumHeader from './AlbumHeader';

export default function AlbumOverview({
  album,
  photos,
  tags,
  count,
  dateRange,
  animateOnFirstLoadOnly,
}: {
  album: Album,
  photos: Media[],
  tags: string[],
  count: number,
  dateRange?: MediaDateRangePostgres,
  animateOnFirstLoadOnly?: boolean,
}) {
  return (
    <MediaGridContainer {...{
      cacheKey: `album-${album.slug}`,
      photos,
      count,
      album,
      header: <AlbumHeader {...{
        album,
        photos,
        tags,
        count,
        dateRange,
        showAlbumMeta: true,
      }} />,
      animateOnFirstLoadOnly,
    }} />
  );
}
