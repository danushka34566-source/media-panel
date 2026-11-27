import { getMedia, getMediaMeta } from '@/media/query';
import {
  getMediaMetaCached,
  getMediaInNeedOfUpdateCountCached,
} from '@/media/cache';
import AdminMediaClient from '@/admin/AdminMediaClient';
import { cookies } from 'next/headers';
import { TIMEZONE_COOKIE_NAME } from '@/utility/timezone';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { PATH_ADMIN_MEDIA } from '@/app/path';
import { getAdminPageNumber } from '@/admin/pagination';
import { redirect } from 'next/navigation';

export const maxDuration = 60;

const ADMIN_MEDIA_PAGE_SIZE = 15;

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const pageNumber = getAdminPageNumber(
    (await searchParams).page,
    ADMIN_MEDIA_PAGE_SIZE,
  );
  const offset = (pageNumber - 1) * ADMIN_MEDIA_PAGE_SIZE;
  const timezone = (await cookies()).get(TIMEZONE_COOKIE_NAME)?.value;
  // The cached total can still include deleted items on a stale last page.
  const getPageMeta = pageNumber > 1 ? getMediaMeta : getMediaMetaCached;

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
    }).catch(() => undefined),
    getPageMeta({ hidden: 'include' })
      .then(({ count }) => count)
      .catch(() => undefined),
    getMediaInNeedOfUpdateCountCached().catch(() => undefined),
  ]);

  const lastPage = photosCount === undefined
    ? pageNumber
    : Math.max(1, Math.ceil(photosCount / ADMIN_MEDIA_PAGE_SIZE));
  if (pageNumber > lastPage) {
    redirect(lastPage === 1
      ? PATH_ADMIN_MEDIA
      : `${PATH_ADMIN_MEDIA}?page=${lastPage}`);
  }

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
