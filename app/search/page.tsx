import AppGrid from '@/components/AppGrid';
import Container from '@/components/Container';
import { USER_DEFAULT_SORT_OPTIONS } from '@/app/config';
import { PATH_ROOT } from '@/app/path';
import MediaGridContainer from '@/media/MediaGridContainer';
import { getMedia, getMediaMeta } from '@/media/query';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const getQueryValue = (value: string | string[] | undefined) =>
  typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value[0]
      : undefined;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = getQueryValue((await searchParams).query)?.trim() ?? '';

  if (!query) {
    return (
      <AppGrid
        contentMain={
          <Container className="min-h-[18rem] space-y-3" padding="loose">
            <h1 className="text-2xl font-bold">Search</h1>
            <p className="text-dim">
              Choose a tag, category, performer, or studio to view matching media.
            </p>
            <Link href={PATH_ROOT} className="text-main hover:underline">
              Back to gallery
            </Link>
          </Container>
        }
      />
    );
  }

  const options = {
    ...USER_DEFAULT_SORT_OPTIONS,
    excludeFromFeeds: true,
    query,
  } as const;

  const [photos, { count }] = await Promise.all([
    getMedia(options).catch(() => []),
    getMediaMeta(options).catch(() => ({ count: 0, dateRange: undefined })),
  ]);

  return (
    <MediaGridContainer
      cacheKey={`page-search-${encodeURIComponent(query)}`}
      photos={photos}
      count={count}
      query={query}
      sortBy={USER_DEFAULT_SORT_OPTIONS.sortBy}
      sortWithPriority={USER_DEFAULT_SORT_OPTIONS.sortWithPriority}
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
