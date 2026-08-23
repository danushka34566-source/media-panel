import { type StorageListResponse } from '@/platforms/storage';
import { safelyQuery } from '@/db/query';
import { query } from '@/platforms/postgres';
import { unstable_cache } from 'next/cache';
import {
  createUploadRegistrationHintsTable,
  clearUploadRegistrationHintForUrl,
  ensureUploadRegistrationHintsColumnTypes,
} from './upload-hints';

const STALE_REGISTRATION_MINUTES = (() => {
  const parsed = Number.parseInt(
    process.env.STALE_REGISTRATION_MINUTES || '',
    10,
  );
  if (!Number.isFinite(parsed)) {
    return 15;
  }
  return Math.min(Math.max(parsed, 1), 24 * 60);
})();

const STALE_REGISTRATION_ERROR_MESSAGE =
  'Previous registration attempt stalled; queued for retry';

const REGISTRATION_HISTORY_DAYS = (() => {
  const parsed = Number.parseInt(
    process.env.REGISTRATION_HISTORY_DAYS || '',
    10,
  );
  if (!Number.isFinite(parsed)) {
    return 14;
  }
  return Math.min(Math.max(parsed, 1), 365);
})();

const createWorkerRegistrationStatusTable = () => query(`
  CREATE TABLE IF NOT EXISTS worker_registration_status (
    url TEXT PRIMARY KEY,
    file_name TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) NOT NULL,
    source_url TEXT,
    original_file_name TEXT,
    title TEXT,
    media_id TEXT,
    extension TEXT,
    error_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )
`);

const createRegisteredUploadFileMapTable = () => query(`
  CREATE TABLE IF NOT EXISTS registered_upload_file_map (
    media_id TEXT PRIMARY KEY,
    original_file_name TEXT NOT NULL,
    stored_file_name TEXT NOT NULL,
    stored_url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )
`);

const ensureWorkerRegistrationStatusColumns = () => query(`
  ALTER TABLE worker_registration_status
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS original_file_name TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS media_id TEXT,
  ADD COLUMN IF NOT EXISTS extension TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT
`);

const ensureWorkerRegistrationStatusColumnTypes = () => query(`
  ALTER TABLE worker_registration_status
  ALTER COLUMN url TYPE TEXT USING url::text,
  ALTER COLUMN file_name TYPE TEXT USING file_name::text
`);

const clearStaleWorkerRegistrationStatuses = async () => {
  // A detected row is queued work, not a failed attempt. Do not label an
  // untouched backlog item as stalled just because it has waited longer than
  // the recovery window; that made the panel show a false error forever when
  // the worker was temporarily unavailable.
  await query(`
    UPDATE worker_registration_status
    SET error_message = NULL
    WHERE status = 'detected'
      AND error_message = $1
  `, [STALE_REGISTRATION_ERROR_MESSAGE]);

  // Only a row that was actually claimed can be recovered as stalled.
  return query(`
    UPDATE worker_registration_status
    SET
      status = 'detected',
      error_message = NULL,
      updated_at = now()
    WHERE status = 'registering'
      AND updated_at < now() - ($1 || ' minutes')::interval
  `, [String(STALE_REGISTRATION_MINUTES)]);
};

const clearCompletedWorkerRegistrationStatuses = () => query(`
  DELETE FROM worker_registration_status
  WHERE status IN ('registered', 'error')
    AND updated_at < now() - ($1 || ' days')::interval
`, [String(REGISTRATION_HISTORY_DAYS)]);

const clearResolvedWorkerRegistrationStatuses = () => query(`
  DELETE FROM worker_registration_status s
  WHERE EXISTS (
    SELECT 1
    FROM media
    WHERE (
      s.media_id IS NOT NULL
      AND media.id = s.media_id
    )
      OR media.url = s.url
      OR (
        s.source_url IS NOT NULL
        AND media.url = s.source_url
      )
  )
    OR EXISTS (
      SELECT 1
      FROM registered_upload_file_map m
      WHERE (
        s.media_id IS NOT NULL
        AND m.media_id = s.media_id
      )
        OR m.stored_url = s.url
        OR (
          s.source_url IS NOT NULL
          AND (
            m.source_url = s.source_url
            OR m.stored_url = s.source_url
          )
        )
    )
`);

export type WorkerRegistrationStatus =
  'detected' | 'registering' | 'registered' | 'error';

export type WorkerRegistrationStatusItem = StorageListResponse[number] & {
  status: WorkerRegistrationStatus
  sourceUrl?: string
  originalFileName?: string
  title?: string
  mediaId?: string
  extension?: string
  errorMessage?: string
};

const ACTIVE_REGISTRATION_STATUSES: WorkerRegistrationStatus[] = [
  'detected',
  'registering',
];

type WorkerRegistrationStatusRow = {
  url: string
  file_name: string | null
  uploaded_at: Date | null
  status: WorkerRegistrationStatus
  source_url: string | null
  original_file_name: string | null
  title: string | null
  media_id: string | null
  extension: string | null
  error_message: string | null
  created_at?: Date | null
};

const mapWorkerRegistrationStatusRow = (
  row: WorkerRegistrationStatusRow,
): WorkerRegistrationStatusItem => ({
  url: row.url,
  fileName: row.file_name || row.url.split('/').pop() || row.url,
  uploadedAt: row.uploaded_at ?? undefined,
  status: row.status,
  sourceUrl: row.source_url ?? undefined,
  originalFileName: row.original_file_name ?? undefined,
  title: row.title ?? undefined,
  mediaId: row.media_id ?? undefined,
  extension: row.extension ?? undefined,
  errorMessage: row.error_message ?? undefined,
});

const prepareWorkerRegistrationRead = async () => {
  await createWorkerRegistrationStatusTable();
  await createRegisteredUploadFileMapTable();
  await ensureWorkerRegistrationStatusColumns();
  await ensureWorkerRegistrationStatusColumnTypes();
  await createUploadRegistrationHintsTable();
  await ensureUploadRegistrationHintsColumnTypes();
  await clearStaleWorkerRegistrationStatuses();
  await clearResolvedWorkerRegistrationStatuses();
  await clearCompletedWorkerRegistrationStatuses();
};

/**
 * Fetch the registration page and total in one prepared read.
 *
 * The processing admin page needs both values for pagination. Keeping these
 * together prevents two concurrent rounds of table setup/cleanup and avoids a
 * second scan of the same anti-join-heavy queue query on every refresh.
 */
export const getUnregisteredStorageUploadsPage = async (
  limit = 1000,
  offset = 0,
) => {
  const pageLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  const pageOffset = Math.max(Math.floor(offset), 0);
  return safelyQuery(async () => {
    await prepareWorkerRegistrationRead();
    return query<{
      total: string
      uploads: WorkerRegistrationStatusRow[]
    }>(`
      WITH eligible AS (
        SELECT
          s.url,
          s.file_name,
          s.uploaded_at,
          s.status,
          s.source_url,
          COALESCE(s.original_file_name, h.original_file_name) AS original_file_name,
          COALESCE(s.title, h.title) AS title,
          s.media_id,
          s.extension,
          s.error_message,
          s.created_at
        FROM worker_registration_status s
        LEFT JOIN upload_registration_hints h
          ON h.url = s.url
        WHERE s.status IN ('detected', 'registering', 'error')
          AND NOT EXISTS (
            SELECT 1
            FROM media
            WHERE (
              s.media_id IS NOT NULL
              AND media.id = s.media_id
            )
              OR media.url = s.url
              OR (
                s.source_url IS NOT NULL
                AND media.url = s.source_url
              )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM registered_upload_file_map m
            WHERE (
              s.media_id IS NOT NULL
              AND m.media_id = s.media_id
            )
              OR m.stored_url = s.url
              OR (
                s.source_url IS NOT NULL
                AND (
                  m.source_url = s.source_url
                  OR m.stored_url = s.source_url
                )
              )
          )
      ), page AS (
        SELECT *
        FROM eligible
        ORDER BY
          CASE status
            WHEN 'registering' THEN 0
            WHEN 'detected' THEN 1
            WHEN 'error' THEN 2
            ELSE 3
          END,
          uploaded_at DESC NULLS LAST,
          created_at DESC,
          url DESC
        LIMIT $1
        OFFSET $2
      )
      SELECT
        (SELECT COUNT(*)::text FROM eligible) AS total,
        COALESCE((
          SELECT jsonb_agg(
            to_jsonb(page)
            ORDER BY
              CASE page.status
                WHEN 'registering' THEN 0
                WHEN 'detected' THEN 1
                WHEN 'error' THEN 2
                ELSE 3
              END,
              page.uploaded_at DESC NULLS LAST,
              page.created_at DESC,
              page.url DESC
          )
          FROM page
        ), '[]'::jsonb) AS uploads
    `, [pageLimit, pageOffset]).then(({ rows }) => {
      const row = rows[0];
      return {
        total: Number.parseInt(row?.total || '0', 10),
        uploads: (row?.uploads || []).map(mapWorkerRegistrationStatusRow),
      };
    });
  }, 'getUnregisteredStorageUploadsPage');
};

export const getUnregisteredStorageUploads = async (limit = 1000, offset = 0) => {
  return safelyQuery(async () => {
    await createWorkerRegistrationStatusTable();
    await createRegisteredUploadFileMapTable();
    await ensureWorkerRegistrationStatusColumns();
    await ensureWorkerRegistrationStatusColumnTypes();
    await createUploadRegistrationHintsTable();
    await ensureUploadRegistrationHintsColumnTypes();
    await clearStaleWorkerRegistrationStatuses();
    await clearResolvedWorkerRegistrationStatuses();
    await clearCompletedWorkerRegistrationStatuses();
    return query<{
      url: string
      file_name: string | null
      uploaded_at: Date | null
      status: WorkerRegistrationStatus
      source_url: string | null
      original_file_name: string | null
      title: string | null
      media_id: string | null
      extension: string | null
      error_message: string | null
    }>(`
      SELECT
        s.url,
        s.file_name,
        s.uploaded_at,
        s.status,
        s.source_url,
        COALESCE(s.original_file_name, h.original_file_name) AS original_file_name,
        COALESCE(s.title, h.title) AS title,
        s.media_id,
        s.extension,
        s.error_message
      FROM worker_registration_status s
      LEFT JOIN upload_registration_hints h
        ON h.url = s.url
      WHERE s.status IN ('detected', 'registering', 'error')
        AND NOT EXISTS (
          SELECT 1
          FROM media
          WHERE (
            s.media_id IS NOT NULL
            AND media.id = s.media_id
          )
            OR media.url = s.url
            OR (
              s.source_url IS NOT NULL
              AND media.url = s.source_url
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM registered_upload_file_map m
          WHERE (
            s.media_id IS NOT NULL
            AND m.media_id = s.media_id
          )
            OR m.stored_url = s.url
            OR (
              s.source_url IS NOT NULL
              AND (
                m.source_url = s.source_url
                OR m.stored_url = s.source_url
              )
            )
        )
      ORDER BY
        CASE s.status
          WHEN 'registering' THEN 0
          WHEN 'detected' THEN 1
          WHEN 'error' THEN 2
          ELSE 3
        END,
        s.uploaded_at DESC NULLS LAST,
        s.created_at DESC,
        s.url DESC
      LIMIT $1
      OFFSET $2
    `, [limit, offset]).then(({ rows }) => rows.map(row => ({
      url: row.url,
      fileName: row.file_name || row.url.split('/').pop() || row.url,
      uploadedAt: row.uploaded_at ?? undefined,
      status: row.status,
      sourceUrl: row.source_url ?? undefined,
      originalFileName: row.original_file_name ?? undefined,
      title: row.title ?? undefined,
      mediaId: row.media_id ?? undefined,
      extension: row.extension ?? undefined,
      errorMessage: row.error_message ?? undefined,
    } satisfies WorkerRegistrationStatusItem)));
  }, 'getUnregisteredStorageUploads');
};

export const getUnregisteredStorageUploadsCount = async () =>
  safelyQuery(async () => {
    await createWorkerRegistrationStatusTable();
    await createRegisteredUploadFileMapTable();
    await ensureWorkerRegistrationStatusColumns();
    await ensureWorkerRegistrationStatusColumnTypes();
    await createUploadRegistrationHintsTable();
    await ensureUploadRegistrationHintsColumnTypes();
    await clearStaleWorkerRegistrationStatuses();
    await clearResolvedWorkerRegistrationStatuses();
    await clearCompletedWorkerRegistrationStatuses();
    return query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM worker_registration_status s
      WHERE s.status IN ('detected', 'registering', 'error')
        AND NOT EXISTS (
          SELECT 1 FROM media
          WHERE (s.media_id IS NOT NULL AND media.id = s.media_id)
            OR media.url = s.url
            OR (s.source_url IS NOT NULL AND media.url = s.source_url)
        )
        AND NOT EXISTS (
          SELECT 1 FROM registered_upload_file_map m
          WHERE (s.media_id IS NOT NULL AND m.media_id = s.media_id)
            OR m.stored_url = s.url
            OR (s.source_url IS NOT NULL AND (m.source_url = s.source_url OR m.stored_url = s.source_url))
        )
    `).then(({ rows }) => Number.parseInt(rows[0]?.count || '0', 10));
  }, 'getUnregisteredStorageUploadsCount');

export const getActiveWorkerRegistrationUploads = async () =>
  getUnregisteredStorageUploads().then(uploads =>
    uploads.filter(upload => ACTIVE_REGISTRATION_STATUSES.includes(upload.status)),
  );

export const getActiveWorkerRegistrationUploadsCached = unstable_cache(
  () => getActiveWorkerRegistrationUploads(),
  ['active-worker-registration-uploads'],
  { revalidate: 5 },
);

export const getActiveWorkerRegistrationUploadsCountCached = unstable_cache(
  () => getActiveWorkerRegistrationUploads().then(uploads => uploads.length),
  ['active-worker-registration-uploads-count'],
  { revalidate: 3 },
);

export const getUnregisteredStorageUploadsCached = (limit?: number, offset?: number) =>
  unstable_cache(
    () => getUnregisteredStorageUploads(limit, offset),
    ['unregistered-storage-uploads', String(limit ?? 1000), String(offset ?? 0)],
    { revalidate: 10 },
  )();

export const getUnregisteredStorageUploadsCountCached = unstable_cache(
  getUnregisteredStorageUploadsCount,
  ['unregistered-storage-uploads-count'],
  { revalidate: 3 },
);

export const getWorkerRegisteringUrls = async () =>
  safelyQuery(async () => {
    await createWorkerRegistrationStatusTable();
    await ensureWorkerRegistrationStatusColumns();
    await ensureWorkerRegistrationStatusColumnTypes();
    await clearStaleWorkerRegistrationStatuses();
    await clearCompletedWorkerRegistrationStatuses();
    return query<{ url: string }>(`
      SELECT url
      FROM worker_registration_status
      WHERE status='registering'
    `).then(({ rows }) => rows.map(row => row.url));
  }, 'getWorkerRegisteringUrls');

export const upsertWorkerRegistrationStatus = async ({
  url,
  fileName,
  uploadedAt,
  status,
  sourceUrl,
  originalFileName,
  title,
  mediaId,
  extension,
  errorMessage,
}: {
  url: string
  fileName?: string
  uploadedAt?: string
  status: WorkerRegistrationStatus
  sourceUrl?: string
  originalFileName?: string
  title?: string
  mediaId?: string
  extension?: string
  errorMessage?: string
}) =>
  safelyQuery(async () => {
    await createWorkerRegistrationStatusTable();
    await ensureWorkerRegistrationStatusColumns();
    await ensureWorkerRegistrationStatusColumnTypes();
    await query(`
      INSERT INTO worker_registration_status (
        url,
        file_name,
        uploaded_at,
        status,
        source_url,
        original_file_name,
        title,
        media_id,
        extension,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (url) DO UPDATE SET
        file_name=COALESCE(EXCLUDED.file_name, worker_registration_status.file_name),
        uploaded_at=COALESCE(EXCLUDED.uploaded_at, worker_registration_status.uploaded_at),
        source_url=COALESCE(EXCLUDED.source_url, worker_registration_status.source_url),
        original_file_name=COALESCE(EXCLUDED.original_file_name, worker_registration_status.original_file_name),
        title=COALESCE(EXCLUDED.title, worker_registration_status.title),
        media_id=COALESCE(EXCLUDED.media_id, worker_registration_status.media_id),
        extension=COALESCE(EXCLUDED.extension, worker_registration_status.extension),
        error_message=EXCLUDED.error_message,
        status=EXCLUDED.status,
        updated_at=now()
    `, [
      url,
      fileName ?? null,
      uploadedAt ?? null,
      status,
      sourceUrl ?? null,
      originalFileName ?? null,
      title ?? null,
      mediaId ?? null,
      extension ?? null,
      errorMessage ?? null,
    ]);
  }, 'upsertWorkerRegistrationStatus');

export const clearWorkerRegistrationStatusForUrl = async (url: string) =>
  safelyQuery(async () => {
    await createWorkerRegistrationStatusTable();
    await ensureWorkerRegistrationStatusColumns();
    await ensureWorkerRegistrationStatusColumnTypes();
    await createUploadRegistrationHintsTable();
    await ensureUploadRegistrationHintsColumnTypes();
    const matchingRows = await query<{
      url: string | null
      source_url: string | null
    }>(
      `
        SELECT url, source_url
        FROM worker_registration_status
        WHERE url = $1 OR source_url = $1
      `,
      [url],
    ).then(({ rows }) => rows);
    const hintUrls = Array.from(new Set([
      url,
      ...matchingRows.flatMap(row =>
        [row.url, row.source_url].filter((value): value is string => Boolean(value))),
    ]));
    await query(
      `
        DELETE FROM worker_registration_status
        WHERE url = $1 OR source_url = $1
      `,
      [url],
    );
    if (hintUrls.length > 0) {
      await Promise.all(hintUrls.map(clearUploadRegistrationHintForUrl));
    } else {
      await clearUploadRegistrationHintForUrl(url);
    }
  }, 'clearWorkerRegistrationStatusForUrl');

export const clearWorkerRegistrationTrackingForMedia = async ({
  mediaId,
  urls,
}: {
  mediaId?: string
  urls?: string[]
}) =>
  safelyQuery(async () => {
    await createWorkerRegistrationStatusTable();
    await ensureWorkerRegistrationStatusColumns();
    await ensureWorkerRegistrationStatusColumnTypes();
    await createRegisteredUploadFileMapTable();
    await createUploadRegistrationHintsTable();
    await ensureUploadRegistrationHintsColumnTypes();

    const uniqueUrls = Array.from(new Set(
      (urls ?? []).filter((url): url is string => Boolean(url)),
    ));

    const statusRows = await Promise.all(uniqueUrls.map(url => query<{
      url: string | null
      source_url: string | null
    }>(
      `
        SELECT url, source_url
        FROM worker_registration_status
        WHERE url = $1 OR source_url = $1
      `,
      [url],
    ).then(({ rows }) => rows))).then(results => results.flat());

    const mapRows = await Promise.all(uniqueUrls.map(url => query<{
      stored_url: string | null
      source_url: string | null
    }>(
      `
        SELECT stored_url, source_url
        FROM registered_upload_file_map
        WHERE stored_url = $1 OR source_url = $1
      `,
      [url],
    ).then(({ rows }) => rows))).then(results => results.flat());

    const hintUrls = Array.from(new Set([
      ...uniqueUrls,
      ...statusRows.flatMap(row =>
        [row.url, row.source_url].filter((value): value is string => Boolean(value))),
      ...mapRows.flatMap(row =>
        [row.stored_url, row.source_url].filter((value): value is string => Boolean(value))),
    ]));

    if (mediaId) {
      await query(
        `
          DELETE FROM worker_registration_status
          WHERE media_id = $1
        `,
        [mediaId],
      );
      await query(
        `
          DELETE FROM registered_upload_file_map
          WHERE media_id = $1
        `,
        [mediaId],
      );
    }

    await Promise.all(uniqueUrls.map(url => query(
      `
        DELETE FROM worker_registration_status
        WHERE url = $1 OR source_url = $1
      `,
      [url],
    )));

    await Promise.all(uniqueUrls.map(url => query(
      `
        DELETE FROM registered_upload_file_map
        WHERE stored_url = $1 OR source_url = $1
      `,
      [url],
    )));

    if (hintUrls.length > 0) {
      await Promise.all(hintUrls.map(clearUploadRegistrationHintForUrl));
    }
  }, 'clearWorkerRegistrationTrackingForMedia');
