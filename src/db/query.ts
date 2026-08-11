import { migrationForError } from './migration';
import { createMediaTable } from '@/media/query';
import sleep from '@/utility/sleep';
import { ADMIN_SQL_DEBUG_ENABLED } from '@/app/config';
import { createAlbumMediaTable, createAlbumsTable } from '@/album/query';

const isMissingMediaTableError = (e: any) =>
  /relation "media" does not exist/i.test(e.message);

const isMissingAlbumTableError = (e: any) =>
  /relation "albums" does not exist/i.test(e.message);

const isMissingAlbumMediaTableError = (e: any) =>
  /relation "album_media" does not exist/i.test(e.message);

const createAllTables = async () => {
  console.log('Creating all tables ...');
  await createMediaTable();
  await createAlbumsTable();
  await createAlbumMediaTable();
};

// Safe wrapper intended for most queries with JIT migration/table creation
// Catches up to 3 migrations in older installations
export const safelyQuery = async <T>(
  callback: () => Promise<T>,
  queryLabel: string,
  queryOptions?: object,
): Promise<T> => {
  let result: T;

  const start = new Date();

  try {
    result = await callback();
  } catch (e: any) {
    // Catch migrations for older installations before falling back to table
    // creation for fresh databases or partially created schemas.
    let migration = migrationForError(e);
    let migrationError = e;
    for (let attempt = 0; attempt < 3 && migration; attempt++) {
      console.log(`Running Migration ${migration.label} ...`);
      await migration.run();
      try {
        result = await callback();
        migrationError = undefined;
        break;
      } catch (retryError: any) {
        migrationError = retryError;
        const nextMigration = migrationForError(retryError);
        if (
          nextMigration?.label === migration.label &&
          (
            isMissingMediaTableError(retryError) ||
            isMissingAlbumTableError(retryError) ||
            isMissingAlbumMediaTableError(retryError)
          )
        ) {
          migration = undefined;
          break;
        }
        migration = nextMigration;
      }
    }

    if (migrationError && (
      isMissingMediaTableError(migrationError) ||
      isMissingAlbumTableError(migrationError) ||
      isMissingAlbumMediaTableError(migrationError)
    )) {
      await createAllTables();
      result = await callback();
    } else if (migrationError && migration) {
      throw migrationError;
    } else if (migrationError && /endpoint is in transition/i.test(e.message)) {
      console.log(
        'SQL query error: endpoint is in transition (setting timeout)',
      );
      // Wait 5 seconds and try again
      await sleep(5000);
      try {
        result = await callback();
      } catch (e: any) {
        console.log(
          `SQL query error on retry (after 5000ms): ${e.message}`,
        );
        throw e;
      }
    } else {
      // Avoid re-logging common errors on initial installation
      if (/connect ECONNREFUSED/i.test(e.message)) {
        console.log('Database connection error');
      } else if (e.message !== 'The server does not support SSL connections') {
        console.log(`SQL query error (${queryLabel}): ${e.message}`, {
          error: e,
        });
      }
      throw e;
    }
  }

  if (ADMIN_SQL_DEBUG_ENABLED && queryLabel) {
    const time =
      (((new Date()).getTime() - start.getTime()) / 1000).toFixed(2);
    const message = `Debug query: ${queryLabel} (${time} seconds)`;
    if (queryOptions) {
      console.log(message, { options: queryOptions });
    } else {
      console.log(message);
    }
  }

  return result;
};
