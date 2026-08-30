import 'server-only';

import { getFileNamePartsFromStorageUrl } from '@/platforms/storage';
import {
  query,
} from '@/platforms/postgres';
import type { Media } from '.';

let deletionQueueTableReady: Promise<void> | undefined;

export const ensureMediaDeletionQueueTable = () => {
  if (!deletionQueueTableReady) {
    deletionQueueTableReady = query(`
      CREATE TABLE IF NOT EXISTS media_deletion_queue (
        media_id TEXT PRIMARY KEY,
        title TEXT,
        urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        prefixes JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        claimed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS media_deletion_queue_status_updated_idx
        ON media_deletion_queue(status, updated_at);
    `).then(() => undefined);
  }
  return deletionQueueTableReady.catch(error => {
    deletionQueueTableReady = undefined;
    throw error;
  });
};

const getRegisteredUrls = async (mediaId: string) => {
  const { rows: tableRows } = await query<{
    file_map: string | null
    registration_status: string | null
  }>(`
    SELECT
      to_regclass('public.registered_upload_file_map')::text AS file_map,
      to_regclass('public.worker_registration_status')::text AS registration_status
  `);
  const urls: string[] = [];
  if (tableRows[0]?.file_map) {
    const { rows } = await query<{
      stored_url: string | null
      source_url: string | null
    }>(`
      SELECT stored_url, source_url
      FROM registered_upload_file_map
      WHERE media_id=$1
    `, [mediaId]);
    urls.push(...rows.flatMap(row => [row.stored_url, row.source_url])
      .filter((value): value is string => Boolean(value)));
  }
  if (tableRows[0]?.registration_status) {
    const { rows } = await query<{
      url: string | null
      source_url: string | null
    }>(`
      SELECT url, source_url
      FROM worker_registration_status
      WHERE media_id=$1
    `, [mediaId]);
    urls.push(...rows.flatMap(row => [row.url, row.source_url])
      .filter((value): value is string => Boolean(value)));
  }
  return urls;
};

export const enqueueMediaDeletion = async ({
  id,
  title,
  url,
  posterUrl,
  previewUrl,
}: Pick<Media, 'id' | 'title' | 'url' | 'posterUrl' | 'previewUrl'>) => {
  await ensureMediaDeletionQueueTable();

  const queuedUrls = Array.from(new Set([
    url,
    posterUrl,
    previewUrl,
    ...await getRegisteredUrls(id),
  ].filter((value): value is string => Boolean(value))));
  const queuedPrefixes = Array.from(new Set(queuedUrls
    .map(value => getFileNamePartsFromStorageUrl(value).fileNameBase)
    .filter(Boolean)));

  await query(`
    INSERT INTO media_deletion_queue (
      media_id, title, urls, prefixes, status, error_message, claimed_at
    ) VALUES ($1, $2, $3::jsonb, $4::jsonb, 'pending', NULL, NULL)
    ON CONFLICT (media_id) DO UPDATE SET
      title=EXCLUDED.title,
      urls=EXCLUDED.urls,
      prefixes=EXCLUDED.prefixes,
      status='pending',
      error_message=NULL,
      claimed_at=NULL,
      updated_at=now()
  `, [
    id,
    title || id,
    JSON.stringify(queuedUrls),
    JSON.stringify(queuedPrefixes),
  ]);

  return { mediaId: id, urls: queuedUrls, prefixes: queuedPrefixes };
};

export const getMediaDeletionQueueStatuses = async (mediaIds: string[]) => {
  await ensureMediaDeletionQueueTable();
  if (mediaIds.length === 0) { return []; }
  const { rows } = await query<{
    media_id: string
    title: string | null
    status: string
    error_message: string | null
  }>(`
    SELECT media_id, title, status, error_message
    FROM media_deletion_queue
    WHERE media_id = ANY($1::text[])
  `, [mediaIds]);
  return rows;
};
