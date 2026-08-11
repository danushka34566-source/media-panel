import { sql } from '@/platforms/postgres';
import { safelyQuery } from '@/db/query';

export const createSubtitleLanguagesTable = () =>
  sql`
    CREATE TABLE IF NOT EXISTS subtitle_languages (
      code VARCHAR(32) PRIMARY KEY,
      label VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;

export const getSubtitleLanguages = () =>
  safelyQuery(async () => {
    await createSubtitleLanguagesTable();
    return sql<{ code: string }>`SELECT code FROM subtitle_languages ORDER BY code ASC`
      .then(({ rows }) => rows.map(r => r.code));
  }, 'getSubtitleLanguages');

export const addSubtitleLanguage = (code: string, label?: string) =>
  safelyQuery(async () => {
    await createSubtitleLanguagesTable();
    await sql`INSERT INTO subtitle_languages (code, label) VALUES (${code}, ${label || null})
      ON CONFLICT (code) DO NOTHING`;
  }, 'addSubtitleLanguage', { code, label });

export const deleteSubtitleLanguage = (code: string) =>
  safelyQuery(async () => {
    await createSubtitleLanguagesTable();
    await sql`DELETE FROM subtitle_languages WHERE code=${code}`;
  }, 'deleteSubtitleLanguage', { code });
