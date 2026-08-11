import { safelyQuery } from '@/db/query';
import { query } from '@/platforms/postgres';

export const createUploadRegistrationHintsTable = () => query(`
  CREATE TABLE IF NOT EXISTS upload_registration_hints (
    url TEXT PRIMARY KEY,
    original_file_name TEXT,
    title TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )
`);

export const ensureUploadRegistrationHintsColumnTypes = () => query(`
  ALTER TABLE upload_registration_hints
  ALTER COLUMN url TYPE TEXT USING url::text,
  ALTER COLUMN original_file_name TYPE TEXT USING original_file_name::text,
  ALTER COLUMN title TYPE TEXT USING title::text
`);

export const upsertUploadRegistrationHint = async ({
  url,
  originalFileName,
  title,
}: {
  url: string
  originalFileName?: string
  title?: string
}) =>
  safelyQuery(async () => {
    await createUploadRegistrationHintsTable();
    await ensureUploadRegistrationHintsColumnTypes();
    await query(`
      INSERT INTO upload_registration_hints (url, original_file_name, title)
      VALUES ($1, $2, $3)
      ON CONFLICT (url) DO UPDATE SET
        original_file_name=
          COALESCE(EXCLUDED.original_file_name, upload_registration_hints.original_file_name),
        title=COALESCE(EXCLUDED.title, upload_registration_hints.title),
        updated_at=now()
    `, [url, originalFileName ?? null, title ?? null]);
  }, 'upsertUploadRegistrationHint');

export const clearUploadRegistrationHintForUrl = async (url: string) =>
  safelyQuery(async () => {
    await createUploadRegistrationHintsTable();
    await ensureUploadRegistrationHintsColumnTypes();
    await query(
      `
        DELETE FROM upload_registration_hints
        WHERE url = $1
      `,
      [url],
    );
  }, 'clearUploadRegistrationHintForUrl');
