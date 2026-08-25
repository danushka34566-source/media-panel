import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { getMediaDeletionQueueStatuses } from '@/media/deletion';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!await isSessionAuthorized('delete')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as {
    mediaIds?: unknown
  };
  const mediaIds = Array.isArray(body.mediaIds)
    ? Array.from(new Set(body.mediaIds
      .filter((id): id is string => typeof id === 'string' && Boolean(id))))
      .slice(0, 500)
    : [];
  if (mediaIds.length === 0) {
    return NextResponse.json({ error: 'mediaIds is required' }, { status: 400 });
  }
  const rows = await getMediaDeletionQueueStatuses(mediaIds);
  const queuedById = new Map(rows.map(row => [row.media_id, row]));
  return NextResponse.json({
    items: mediaIds.map(mediaId => {
      const queued = queuedById.get(mediaId);
      return queued
        ? {
          mediaId,
          title: queued.title || undefined,
          status: queued.status,
          error: queued.error_message || undefined,
        }
        : { mediaId, status: 'completed' };
    }),
  });
}
