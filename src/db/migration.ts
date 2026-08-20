import { query, sql } from '@/platforms/postgres';

interface Migration {
  label: string
  table?: 'media' | 'albums'
  fields: string[]
  run: () => ReturnType<typeof sql>
}

export const MIGRATIONS: Migration[] = [{
  label: '00: Rename Photos To Media',
  fields: ['__media_table__'],
  run: () => query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name='photos'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name='media'
      ) THEN
        ALTER TABLE photos RENAME TO media;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name='album_photo'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name='album_media'
      ) THEN
        ALTER TABLE album_photo RENAME TO album_media;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='album_media'
        AND column_name='photo_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='album_media'
        AND column_name='media_id'
      ) THEN
        ALTER TABLE album_media RENAME COLUMN photo_id TO media_id;
      END IF;
    END $$;
  `),
}, {
  label: '01: AI Text Generation',
  fields: ['caption', 'semantic_description'],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS caption TEXT,
    ADD COLUMN IF NOT EXISTS semantic_description TEXT
  `,
}, {
  label: '02: Lens Metadata',
  fields: ['lens_make', 'lens_model'],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS lens_make VARCHAR(255),
    ADD COLUMN IF NOT EXISTS lens_model VARCHAR(255)
  `,
}, {
  label: '03: Fujifilm Recipe: Data',
  fields: ['recipe_data'],
  run: () => sql`
    DO $$
    BEGIN
      IF EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='media'
        AND column_name='fujifilm_recipe'
      )
      THEN
        ALTER TABLE media
        RENAME COLUMN fujifilm_recipe TO recipe_data;
      ELSE
        ALTER TABLE media
        ADD COLUMN IF NOT EXISTS recipe_data JSONB;
      END IF;
    END $$;
  `,
}, {
  label: '04: Fujifilm Recipe: Title',
  fields: ['recipe_title'],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS recipe_title VARCHAR(255)
  `,
}, {
  label: '05: Universal Film',
  fields: ['film'],
  run: () => sql`
    DO $$
    BEGIN
      IF EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='media'
        AND column_name='film_simulation'
      )
      THEN
        ALTER TABLE media
        RENAME COLUMN film_simulation TO film;
      ELSE
        ALTER TABLE media
        ADD COLUMN IF NOT EXISTS film VARCHAR(255);
      END IF;
    END $$;
  `,
}, {
  label: '06: Exclude from feeds',
  fields: ['exclude_from_feeds'],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS exclude_from_feeds BOOLEAN DEFAULT FALSE
  `,
}, {
  label: '07: Color Data',
  fields: ['color_data', 'color_sort'],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS color_data JSONB,
    ADD COLUMN IF NOT EXISTS color_sort SMALLINT
  `,
}, {
  label: '08: Location',
  table: 'albums',
  fields: ['location'],
  // `query()` seemingly required to execute
  // ADD and DROP column alteration in same migration
  run: () => query(`
    ALTER TABLE albums
    ADD COLUMN IF NOT EXISTS location JSONB;
    ALTER TABLE albums
    DROP COLUMN IF EXISTS location_name,
    DROP COLUMN IF EXISTS latitude,
    DROP COLUMN IF EXISTS longitude;
  `),
}, {
  label: '09: Media Metadata',
  fields: [
    'media_type',
    'duration_seconds',
    'frame_rate',
    'media_width',
    'media_height',
    'poster_url',
    'preview_url',
    'transcode_status',
    'transcode_error',
  ],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) DEFAULT 'photo',
    ADD COLUMN IF NOT EXISTS duration_seconds REAL,
    ADD COLUMN IF NOT EXISTS frame_rate REAL,
    ADD COLUMN IF NOT EXISTS media_width INTEGER,
    ADD COLUMN IF NOT EXISTS media_height INTEGER,
    ADD COLUMN IF NOT EXISTS poster_url VARCHAR(255),
    ADD COLUMN IF NOT EXISTS preview_url VARCHAR(255),
    ADD COLUMN IF NOT EXISTS transcode_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS transcode_error TEXT
  `,
}, {
  label: '10: 12 Digit Media IDs',
  fields: ['id'],
  run: () => query(`
    DO $$
    DECLARE
      album_media_constraint_name text;
    BEGIN
      SELECT constraint_name INTO album_media_constraint_name
      FROM information_schema.table_constraints
      WHERE table_name='album_media'
      AND constraint_type='FOREIGN KEY'
      LIMIT 1;

      IF album_media_constraint_name IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE album_media DROP CONSTRAINT IF EXISTS %I',
          album_media_constraint_name
        );
      END IF;

      ALTER TABLE media
      ALTER COLUMN id TYPE VARCHAR(12);

      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name='album_media'
      ) THEN
        ALTER TABLE album_media
        ALTER COLUMN media_id TYPE VARCHAR(12);

        ALTER TABLE album_media
        ADD CONSTRAINT album_media_media_id_fkey
        FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `),
}, {
  label: '14: Media Categories',
  fields: ['categories'],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS categories VARCHAR(255)[]
  `,
}, {
  label: '13: Video Content Types Array',
  fields: ['__content_type_array__'],
  run: () => query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='media' AND column_name='content_type'
      ) THEN
        ALTER TABLE media
        ALTER COLUMN content_type TYPE VARCHAR(255)[]
        USING CASE
          WHEN content_type IS NULL OR BTRIM(content_type) = '' THEN NULL
          ELSE ARRAY[content_type]
        END;
      END IF;
    END $$;
  `),
}, {
  label: '12: Video Library Metadata',
  fields: [
    'studio',
    'performers',
    'content_type',
    'rating',
    'watched',
  ],
  run: () => sql`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS studio VARCHAR(255),
    ADD COLUMN IF NOT EXISTS performers VARCHAR(255)[],
    ADD COLUMN IF NOT EXISTS content_type VARCHAR(255)[],
    ADD COLUMN IF NOT EXISTS rating SMALLINT,
    ADD COLUMN IF NOT EXISTS watched BOOLEAN DEFAULT FALSE
  `,
}, {
  label: '11: Unique Media Storage URLs',
  fields: ['__media_url_unique__'],
  run: () => query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name='media'
      ) THEN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name='album_media'
        ) THEN
          WITH ranked AS (
            SELECT
              id,
              FIRST_VALUE(id) OVER (
                PARTITION BY url
                ORDER BY created_at ASC, updated_at ASC, id ASC
              ) AS keeper_id,
              ROW_NUMBER() OVER (
                PARTITION BY url
                ORDER BY created_at ASC, updated_at ASC, id ASC
              ) AS duplicate_rank
            FROM media
          )
          INSERT INTO album_media (album_id, media_id, sort_order)
          SELECT am.album_id, ranked.keeper_id, am.sort_order
          FROM album_media am
          JOIN ranked ON ranked.id=am.media_id
          WHERE ranked.duplicate_rank > 1
          ON CONFLICT (album_id, media_id) DO NOTHING;
        END IF;

        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY url
              ORDER BY created_at ASC, updated_at ASC, id ASC
            ) AS duplicate_rank
          FROM media
        )
        DELETE FROM media
        USING ranked
        WHERE media.id=ranked.id
        AND ranked.duplicate_rank > 1;

        ALTER TABLE media
        ADD CONSTRAINT media_url_unique UNIQUE (url);
      END IF;
    EXCEPTION
      WHEN duplicate_object OR duplicate_table THEN
        NULL;
    END $$;
  `),
}, {
  label: '15: Full Video HLS Delivery',
  fields: ['hls_manifest_url', 'hls_verified_at'],
  run: () => query(`
    ALTER TABLE media
    ADD COLUMN IF NOT EXISTS hls_manifest_url TEXT,
    ADD COLUMN IF NOT EXISTS hls_verified_at TIMESTAMP WITH TIME ZONE;

    CREATE INDEX IF NOT EXISTS media_hls_reconciliation_idx
    ON media (hls_verified_at ASC NULLS FIRST, id ASC)
    WHERE media_type='video' AND transcode_status='ready';
  `),
}];

export const migrationForError = (e: any) =>
  /relation "media" does not exist/i.test(e.message) ||
  /relation "album_media" does not exist/i.test(e.message)
    ? MIGRATIONS.find(({ label }) => label === '00: Rename Photos To Media')
    : /value too long for type character varying\(8\)/i.test(e.message)
    ? MIGRATIONS.find(({ label }) => label === '10: 12 Digit Media IDs')
    : /there is no unique or exclusion constraint matching the ON CONFLICT specification/i.test(e.message)
    ? MIGRATIONS.find(({ label }) => label === '11: Unique Media Storage URLs')
    : MIGRATIONS.find(({ fields, table = 'media' }) =>
    fields.some(field =>(
      // eslint-disable-next-line max-len
      new RegExp(`column "${field}" of relation "${table}" does not exist`, 'i').test(e.message) ||
      new RegExp(`column "${field}" does not exist`, 'i').test(e.message)
    )),
    );
