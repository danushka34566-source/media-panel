import AppGrid from '@/components/AppGrid';
import Container from '@/components/Container';
import { getMediaSearchQuery, PATH_ROOT } from '@/app/path';
import MediaGridContainer from '@/media/MediaGridContainer';
import { getMedia, getMediaMeta } from '@/media/query';
import BackLink from '@/components/BackLink';
import { getEffectiveMediaSortOptions } from '@/media/sort/preference';
import { INFINITE_SCROLL_GRID_INITIAL } from '@/media';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = getMediaSearchQuery((await searchParams).query);

  if (!query) {
    return (
      <AppGrid
        contentMain={
          <Container className="min-h-[18rem] space-y-3" padding="loose">
            <h1 className="text-2xl font-bold">Search</h1>
            <p className="text-dim">
              Choose a tag, category, performer, or studio to view matching media.
            </p>
            <BackLink href={PATH_ROOT} matchPath className="text-main hover:underline">
              Back to gallery
            </BackLink>
          </Container>
        }
      />
    );
  }

  const sortOptions = await getEffectiveMediaSortOptions();
  const options = {
    ...sortOptions,
    excludeFromFeeds: true,
    query,
  } as const;

  const [photos, { count }] = await Promise.all([
    getMedia({ ...options, limit: INFINITE_SCROLL_GRID_INITIAL }),
    getMediaMeta(options),
  ]);

  return (
    <MediaGridContainer
      cacheKey={`page-search-${encodeURIComponent(query)}`}
      photos={photos}
      count={count}
      query={query}
      sortBy={sortOptions.sortBy}
      sortWithPriority={sortOptions.sortWithPriority}
      excludeFromFeeds
      header={
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Search</h1>
          <p className="text-dim">
            {count} result{count === 1 ? '' : 's'} for{' '}
            <span className="font-medium text-main">{query}</span>
          </p>
        </div>
      }
    />
  );
}
