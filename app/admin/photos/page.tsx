import { getMedia } from '@/media/query';
import {
  getMediaMetaCached,
  getMediaInNeedOfUpdateCountCached,
} from '@/media/cache';
import AdminMediaClient from '@/admin/AdminMediaClient';
import { cookies } from 'next/headers';
import { TIMEZONE_COOKIE_NAME } from '@/utility/timezone';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';

export const maxDuration = 60;

const ADMIN_MEDIA_PAGE_SIZE = 15;

const getPageNumber = (page?: string | string[]) => {
  const value = Array.isArray(page) ? page[0] : page;
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const pageNumber = getPageNumber((await searchParams).page);
  const offset = (pageNumber - 1) * ADMIN_MEDIA_PAGE_SIZE;
  const timezone = (await cookies()).get(TIMEZONE_COOKIE_NAME)?.value;

  const [
    photos,
    photosCount,
    photosCountNeedsSync,
  ] = await Promise.all([
    getMedia({
      hidden: 'include',
      sortBy: 'createdAt',
      limit: ADMIN_MEDIA_PAGE_SIZE,
      offset,
      includeMissingStorageStatus: true,
    }).catch(() => []),
    getMediaMetaCached({ hidden: 'include'})
      .then(({ count }) => count)
      .catch(() => 0),
    getMediaInNeedOfUpdateCountCached()
      .catch(() => 0),
  ]);

  return (
    <AdminMediaClient {...{
      photos,
      photosCount,
      photosCountNeedsSync,
      hasAiTextGeneration: AI_CONTENT_GENERATION_ENABLED,
      pageNumber,
      pageSize: ADMIN_MEDIA_PAGE_SIZE,
      timezone,
    }} />
  );
}
