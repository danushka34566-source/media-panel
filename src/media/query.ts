/* eslint-disable quotes */
import {
  sql,
  query,
  type Primitive,
} from '@/platforms/postgres';
import { convertArrayToPostgresString } from '@/db';
import {
  MediaDb,
  MediaDbInsert,
  getKeywordsForMedia,
  translateMediaId,
  parseMediaFromDb,
  Media,
  MediaDateRangePostgres,
  normalizeStoredArray,
} from '@/media';
import { Cameras, createCameraKey } from '@/camera';
import { Tags } from '@/tag';
import { Films } from '@/film';
import {
  AI_TEXT_AUTO_GENERATED_FIELDS,
  AI_CONTENT_GENERATION_ENABLED,
  COLOR_SORT_ENABLED,
  USER_DEFAULT_SORT_BY,
} from '@/app/config';
import {
  MediaQueryOptions,
  getOrderByFromOptions,
  getLimitAndOffsetFromOptions,
  getWheresFromOptions,
  getJoinsFromOptions,
} from '../db';
import { FocalLengths } from '@/focal';
import { Lenses, createLensKey } from '@/lens';
import {
  UPDATE_QUERY_LIMIT,
  OUTDATED_UPDATE_AT_THRESHOLD,
} from '@/media/update';
import { Recipes } from '@/recipe';
import { Years } from '@/year';
import { MediaColorData } from '@/media/color/client';
import { safelyQuery } from '@/db/query';
import {
  getVirtualStorageVideoMedia,
  getVirtualStorageVideoMediaItems,
  isVirtualStorageVideoId,
} from '@/media/storage/virtual';
import {
  getCurrentStorageUrlsForPrefix,
  getFileNamePartsFromStorageUrl,
} from '@/platforms/storage';
import { mapWithConcurrency } from '@/utility/concurrency';

const parseMediaRowsSafely = (
  rows: MediaDb[],
  source: string,
) =>
  rows.flatMap(row => {
    try {
      return [parseMediaFromDb(row)];
    } catch (error: any) {
      console.error(`Failed to parse media row from ${source}`, {
        id: (row as Partial<MediaDb>)?.id,
        url: (row as Partial<MediaDb>)?.url,
        error: error?.message || error,
      });
      return [];
    }
  });

const optionsSupportVirtualStorageVideos = (_options: MediaQueryOptions = {}) =>
  false;

const virtualMediaMatchesOptions = (
  photo: Media,
  options: MediaQueryOptions = {},
) => {
  if (options.hidden === 'only') { return false; }
  if (options.excludeFromFeeds && photo.excludeFromFeeds) { return false; }
  if (
    options.takenBefore &&
    photo.takenAt.getTime() >= options.takenBefore.getTime()
  ) { return false; }
  if (
    options.takenAfterInclusive &&
    photo.takenAt.getTime() < options.takenAfterInclusive.getTime()
  ) { return false; }
  if (
    options.updatedBefore &&
    photo.updatedAt.getTime() >= options.updatedBefore.getTime()
  ) { return false; }
  if (
    options.query &&
    !getKeywordsForMedia(photo)
      .join(' ')
      .includes(options.query.toLocaleLowerCase())
  ) { return false; }
  if (
    options.maximumAspectRatio &&
    photo.aspectRatio > options.maximumAspectRatio
  ) { return false; }
  if (
    options.year &&
    photo.takenAt.getFullYear().toString() !== options.year
  ) { return false; }
  if (
    options.category &&
    !photo.categories.includes(options.category)
  ) { return false; }
  if (
    options.studio &&
    photo.studio !== options.studio
  ) { return false; }
  if (
    options.performer &&
    !photo.performers.includes(options.performer)
  ) { return false; }
  if (
    options.contentType &&
    !photo.contentType.includes(options.contentType)
  ) { return false; }
  return true;
};

const sortMediaForOptions = (
  photos: Media[],
  {
    sortBy = USER_DEFAULT_SORT_BY,
    sortWithPriority,
  }: MediaQueryOptions = {},
) => [...photos].sort((a, b) => {
  if (sortWithPriority) {
    const priorityA = a.priorityOrder ?? Number.MAX_SAFE_INTEGER;
    const priorityB = b.priorityOrder ?? Number.MAX_SAFE_INTEGER;
    if (priorityA !== priorityB) { return priorityA - priorityB; }
  }

  const newestFallback =
    b.createdAt.getTime() - a.createdAt.getTime() ||
    b.id.localeCompare(a.id);
  const oldestFallback =
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id);

  switch (sortBy) {
    case 'takenAtAsc':
      return a.takenAt.getTime() - b.takenAt.getTime() || oldestFallback;
    case 'createdAt':
      return newestFallback;
    case 'createdAtAsc':
      return oldestFallback;
    case 'color':
      return (b.colorSort ?? -1) - (a.colorSort ?? -1) ||
        b.takenAt.getTime() - a.takenAt.getTime() ||
        newestFallback;
    case 'colorAsc':
      return (a.colorSort ?? Number.MAX_SAFE_INTEGER) -
        (b.colorSort ?? Number.MAX_SAFE_INTEGER) ||
        a.takenAt.getTime() - b.takenAt.getTime() ||
        oldestFallback;
    case 'takenAt':
    default:
      return b.takenAt.getTime() - a.takenAt.getTime() || newestFallback;
  }
});

const applyLimitAndOffset = (
  photos: Media[],
  { limit = 100, offset = 0 }: MediaQueryOptions = {},
) => photos.slice(offset, offset + limit);

const getMediaStorageDedupeKey = (photo: Media) =>
  photo.url.toLowerCase();

const dedupeMediaByStorageKey = (photos: Media[]) => {
  const photosByStorageKey = new Map<string, Media>();
  for (const photo of photos) {
    const key = getMediaStorageDedupeKey(photo);
    if (!photosByStorageKey.has(key)) {
      photosByStorageKey.set(key, photo);
    }
  }
  return Array.from(photosByStorageKey.values());
};

const normalizeStorageUrl = (url: string) =>
  decodeURIComponent(url).split('?')[0].trim().toLocaleLowerCase();

const getMissingStorageErrorForMedia = (
  photo: Media,
  existingUrlsByFileNameBase: Map<string, Set<string> | undefined>,
) => {
  if (isVirtualStorageVideoId(photo.id)) {
    return undefined;
  }

  const { fileNameBase } = getFileNamePartsFromStorageUrl(photo.url);
  if (!fileNameBase) {
    return 'Missing storage file reference';
  }

  const existingUrls = existingUrlsByFileNameBase.get(fileNameBase);
  if (!existingUrls) {
    return undefined;
  }
  const requiredUrls = [
    photo.url,
    photo.posterUrl,
    photo.previewUrl,
  ].filter((url): url is string => Boolean(url));
  const missingRequiredUrls = requiredUrls.filter(url =>
    !existingUrls.has(normalizeStorageUrl(url)));

  if (missingRequiredUrls.length > 0) {
    return missingRequiredUrls.length === 1
      ? 'Missing storage asset'
      : 'Missing storage assets';
  }

  return undefined;
};

const attachMissingStorageStatus = async (photos: Media[]) =>
  Promise.resolve(photos)
    .then(async reconciledPhotos => {
      const uniqueFileNameBases = Array.from(new Set(
        reconciledPhotos
          .filter(photo => !isVirtualStorageVideoId(photo.id))
          .map(photo => getFileNamePartsFromStorageUrl(photo.url).fileNameBase)
          .filter((fileNameBase): fileNameBase is string => Boolean(fileNameBase)),
      ));

      const existingUrlsByFileNameBase = new Map<string, Set<string> | undefined>();
      await mapWithConcurrency(uniqueFileNameBases, 4, async fileNameBase => {
        try {
          const storageUrls = await getCurrentStorageUrlsForPrefix(fileNameBase);
          existingUrlsByFileNameBase.set(
            fileNameBase,
            new Set(storageUrls.map(({ url }) => normalizeStorageUrl(url))),
          );
        } catch (error) {
          console.warn('Skipping missing-storage check for media prefix', {
            fileNameBase,
            error,
          });
          existingUrlsByFileNameBase.set(fileNameBase, undefined);
        }
      });

      return reconciledPhotos.map(photo => {
        const missingStorageError = getMissingStorageErrorForMedia(
          photo,
          existingUrlsByFileNameBase,
        );
        return missingStorageError
          ? { ...photo, missingStorageError }
          : photo;
      });
    });

export const createMediaTable = () =>
  sql`
    CREATE TABLE IF NOT EXISTS media (
      id VARCHAR(12) PRIMARY KEY,
      url VARCHAR(255) NOT NULL UNIQUE,
      extension VARCHAR(255) NOT NULL,
      media_type VARCHAR(10) NOT NULL DEFAULT 'photo',
      categories VARCHAR(255)[],
      studio VARCHAR(255),
      performers VARCHAR(255)[],
      content_type VARCHAR(255)[],
      rating SMALLINT,
      watched BOOLEAN DEFAULT FALSE,
      duration_seconds REAL,
      frame_rate REAL,
      media_width INTEGER,
      media_height INTEGER,
      poster_url VARCHAR(255),
      preview_url VARCHAR(255),
      hls_manifest_url TEXT,
      hls_verified_at TIMESTAMP WITH TIME ZONE,
      transcode_status VARCHAR(50),
      transcode_error TEXT,
      aspect_ratio REAL DEFAULT 1.5,
      blur_data TEXT,
      title VARCHAR(255),
      caption TEXT,
      semantic_description TEXT,
      tags VARCHAR(255)[],
      make VARCHAR(255),
      model VARCHAR(255),
      focal_length SMALLINT,
      focal_length_in_35mm_format SMALLINT,
      lens_make VARCHAR(255),
      lens_model VARCHAR(255),
      f_number REAL,
      iso SMALLINT,
      exposure_time DOUBLE PRECISION,
      exposure_compensation REAL,
      location_name VARCHAR(255),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      film VARCHAR(255),
      recipe_title VARCHAR(255),
      recipe_data JSONB,
      color_data JSONB,
      color_sort SMALLINT,
      priority_order REAL,
      taken_at TIMESTAMP WITH TIME ZONE NOT NULL,
      taken_at_naive VARCHAR(255) NOT NULL,
      exclude_from_feeds BOOLEAN DEFAULT FALSE,
      hidden BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;

// Must provide id as 12-digit media id
export const insertMedia = (photo: MediaDbInsert) =>
  safelyQuery(() => sql`
    INSERT INTO media (
      id,
      url,
      extension,
      media_type,
      categories,
      studio,
      performers,
      content_type,
      rating,
      watched,
      duration_seconds,
      frame_rate,
      media_width,
      media_height,
      poster_url,
      preview_url,
      transcode_status,
      transcode_error,
      aspect_ratio,
      blur_data,
      title,
      caption,
      semantic_description,
      tags,
      make,
      model,
      focal_length,
      focal_length_in_35mm_format,
      lens_make,
      lens_model,
      f_number,
      iso,
      exposure_time,
      exposure_compensation,
      location_name,
      latitude,
      longitude,
      film,
      recipe_title,
      recipe_data,
      color_data,
      color_sort,
      priority_order,
      exclude_from_feeds,
      hidden,
      taken_at,
      taken_at_naive
    ) VALUES (
      ${photo.id},
      ${photo.url},
      ${photo.extension},
      ${photo.mediaType},
      ${convertArrayToPostgresString(photo.categories)},
      ${photo.studio},
      ${convertArrayToPostgresString(photo.performers)},
      ${convertArrayToPostgresString(photo.contentType)},
      ${photo.rating},
      ${photo.watched},
      ${photo.durationSeconds},
      ${photo.frameRate},
      ${photo.mediaWidth},
      ${photo.mediaHeight},
      ${photo.posterUrl},
      ${photo.previewUrl},
      ${photo.transcodeStatus},
      ${photo.transcodeError},
      ${photo.aspectRatio},
      ${photo.blurData},
      ${photo.title},
      ${photo.caption},
      ${photo.semanticDescription},
      ${convertArrayToPostgresString(photo.tags)},
      ${photo.make},
      ${photo.model},
      ${photo.focalLength},
      ${photo.focalLengthIn35MmFormat},
      ${photo.lensMake},
      ${photo.lensModel},
      ${photo.fNumber},
      ${photo.iso},
      ${photo.exposureTime},
      ${photo.exposureCompensation},
      ${photo.locationName},
      ${photo.latitude},
      ${photo.longitude},
      ${photo.film},
      ${photo.recipeTitle},
      ${photo.recipeData},
      ${photo.colorData},
      ${photo.colorSort},
      ${photo.priorityOrder},
      ${photo.excludeFromFeeds},
      ${photo.hidden},
      ${photo.takenAt},
      ${photo.takenAtNaive}
    )
    ON CONFLICT (url) DO UPDATE SET
      extension=EXCLUDED.extension,
      media_type=EXCLUDED.media_type,
      categories=EXCLUDED.categories,
      studio=EXCLUDED.studio,
      performers=EXCLUDED.performers,
      content_type=EXCLUDED.content_type,
      rating=EXCLUDED.rating,
      watched=EXCLUDED.watched,
      duration_seconds=EXCLUDED.duration_seconds,
      frame_rate=EXCLUDED.frame_rate,
      media_width=EXCLUDED.media_width,
      media_height=EXCLUDED.media_height,
      poster_url=EXCLUDED.poster_url,
      preview_url=EXCLUDED.preview_url,
      transcode_status=EXCLUDED.transcode_status,
      transcode_error=EXCLUDED.transcode_error,
      aspect_ratio=EXCLUDED.aspect_ratio,
      blur_data=EXCLUDED.blur_data,
      title=CASE
        WHEN NULLIF(media.title, '') IS NOT NULL
          AND media.title !~ '^[0-9]{12}([-_].*)?$'
          THEN media.title
        ELSE EXCLUDED.title
      END,
      caption=EXCLUDED.caption,
      semantic_description=EXCLUDED.semantic_description,
      tags=EXCLUDED.tags,
      make=EXCLUDED.make,
      model=EXCLUDED.model,
      focal_length=EXCLUDED.focal_length,
      focal_length_in_35mm_format=EXCLUDED.focal_length_in_35mm_format,
      lens_make=EXCLUDED.lens_make,
      lens_model=EXCLUDED.lens_model,
      f_number=EXCLUDED.f_number,
      iso=EXCLUDED.iso,
      exposure_time=EXCLUDED.exposure_time,
      exposure_compensation=EXCLUDED.exposure_compensation,
      location_name=EXCLUDED.location_name,
      latitude=EXCLUDED.latitude,
      longitude=EXCLUDED.longitude,
      film=EXCLUDED.film,
      recipe_title=EXCLUDED.recipe_title,
      recipe_data=EXCLUDED.recipe_data,
      color_data=EXCLUDED.color_data,
      color_sort=EXCLUDED.color_sort,
      priority_order=COALESCE(media.priority_order, EXCLUDED.priority_order),
      exclude_from_feeds=EXCLUDED.exclude_from_feeds,
      hidden=EXCLUDED.hidden,
      taken_at=EXCLUDED.taken_at,
      taken_at_naive=EXCLUDED.taken_at_naive,
      updated_at=now()
    RETURNING id
  `.then(({ rows }) => rows[0]?.id as string | undefined), 'insertMedia');

export const updateMedia = (photo: MediaDbInsert) =>
  safelyQuery(() => sql`
    UPDATE media SET
      url=${photo.url},
      extension=${photo.extension},
      media_type=${photo.mediaType},
      categories=${convertArrayToPostgresString(photo.categories)},
      studio=${photo.studio},
      performers=${convertArrayToPostgresString(photo.performers)},
      content_type=${convertArrayToPostgresString(photo.contentType)},
      rating=${photo.rating},
      watched=${photo.watched},
      duration_seconds=${photo.durationSeconds},
      frame_rate=${photo.frameRate},
      media_width=${photo.mediaWidth},
      media_height=${photo.mediaHeight},
      poster_url=${photo.posterUrl},
      preview_url=${photo.previewUrl},
      transcode_status=${photo.transcodeStatus},
      transcode_error=${photo.transcodeError},
      aspect_ratio=${photo.aspectRatio},
      blur_data=${photo.blurData},
      title=${photo.title},
      caption=${photo.caption},
      semantic_description=${photo.semanticDescription},
      tags=${convertArrayToPostgresString(photo.tags)},
      make=${photo.make},
      model=${photo.model},
      focal_length=${photo.focalLength},
      focal_length_in_35mm_format=${photo.focalLengthIn35MmFormat},
      lens_make=${photo.lensMake},
      lens_model=${photo.lensModel},
      f_number=${photo.fNumber},
      iso=${photo.iso},
      exposure_time=${photo.exposureTime},
      exposure_compensation=${photo.exposureCompensation},
      location_name=${photo.locationName},
      latitude=${photo.latitude},
      longitude=${photo.longitude},
      film=${photo.film},
      recipe_title=${photo.recipeTitle},
      recipe_data=${photo.recipeData},
      color_data=${photo.colorData},
      color_sort=${photo.colorSort},
      priority_order=${photo.priorityOrder || null},
      exclude_from_feeds=${photo.excludeFromFeeds},
      hidden=${photo.hidden},
      taken_at=${photo.takenAt},
      taken_at_naive=${photo.takenAtNaive},
      updated_at=${(new Date()).toISOString()}
    WHERE id=${photo.id}
  `, 'updateMedia');

export const deleteMediaTagGlobally = (tag: string) =>
  safelyQuery(() => sql`
    UPDATE media
    SET tags=ARRAY_REMOVE(tags, ${tag})
    WHERE ${tag}=ANY(tags)
  `, 'deleteMediaTagGlobally');

export const deleteMediaCategoryGlobally = (category: string) =>
  safelyQuery(() => sql`
    UPDATE media
    SET categories=ARRAY_REMOVE(categories, ${category})
    WHERE ${category}=ANY(categories)
  `, 'deleteMediaCategoryGlobally');

export const deleteMediaStudioGlobally = (studio: string) =>
  safelyQuery(() => sql`
    UPDATE media
    SET studio=NULL
    WHERE studio=${studio}
  `, 'deleteMediaStudioGlobally');

export const deleteMediaPerformerGlobally = (performer: string) =>
  safelyQuery(() => sql`
    UPDATE media
    SET performers=ARRAY_REMOVE(performers, ${performer})
    WHERE ${performer}=ANY(performers)
  `, 'deleteMediaPerformerGlobally');

export const deleteMediaContentTypeGlobally = (contentType: string) =>
  safelyQuery(() => sql`
    UPDATE media
    SET content_type=ARRAY_REMOVE(content_type, ${contentType})
    WHERE ${contentType}=ANY(content_type)
  `, 'deleteMediaContentTypeGlobally');

export const renameMediaTagGlobally = (tag: string, updatedTag: string) =>
  safelyQuery(() => sql`
    UPDATE media
    SET tags=ARRAY_REPLACE(tags, ${tag}, ${updatedTag})
    WHERE ${tag}=ANY(tags)
  `, 'renameMediaTagGlobally');

export const renameMediaCategoryGlobally = (
  category: string,
  updatedCategory: string,
) => safelyQuery(() => sql`
  UPDATE media
  SET categories=ARRAY_REPLACE(categories, ${category}, ${updatedCategory})
  WHERE ${category}=ANY(categories)
`, 'renameMediaCategoryGlobally');

export const renameMediaStudioGlobally = (
  studio: string,
  updatedStudio: string,
) => safelyQuery(() => sql`
  UPDATE media
  SET studio=${updatedStudio}
  WHERE studio=${studio}
`, 'renameMediaStudioGlobally');

export const renameMediaPerformerGlobally = (
  performer: string,
  updatedPerformer: string,
) => safelyQuery(() => sql`
  UPDATE media
  SET performers=ARRAY_REPLACE(performers, ${performer}, ${updatedPerformer})
  WHERE ${performer}=ANY(performers)
`, 'renameMediaPerformerGlobally');

export const renameMediaContentTypeGlobally = (
  contentType: string,
  updatedContentType: string,
) => safelyQuery(() => sql`
  UPDATE media
  SET content_type=ARRAY_REPLACE(content_type, ${contentType}, ${updatedContentType})
  WHERE ${contentType}=ANY(content_type)
`, 'renameMediaContentTypeGlobally');

export type MediaLibraryValueType =
  | 'tag'
  | 'category'
  | 'studio'
  | 'performer'
  | 'contentType';

const mediaLibraryArrayColumns = {
  tag: 'tags',
  category: 'categories',
  performer: 'performers',
  contentType: 'content_type',
} as const;

const mediaLibraryColumn = (type: MediaLibraryValueType) =>
  type === 'studio' ? 'studio' : mediaLibraryArrayColumns[type];

export const updateMediaLibraryValueGlobally = ({
  sourceType,
  targetType,
  value,
  updatedValue,
}: {
  sourceType: MediaLibraryValueType
  targetType: MediaLibraryValueType
  value: string
  updatedValue: string
}) => {
  const sourceColumn = mediaLibraryColumn(sourceType);
  const targetColumn = mediaLibraryColumn(targetType);
  const arrayColumns = ['tags', 'categories', 'performers', 'content_type'];
  const setStatements = arrayColumns.map(column => {
    const isSource = sourceColumn === column;
    const isTarget = targetColumn === column;
    if (!isSource && !isTarget) { return `${column}=${column}`; }
    if (isSource && isTarget) {
      return `${column}=array_append(array_remove(array_remove(` +
        `COALESCE(${column}, '{}'), $1), $2), $2)`;
    }
    if (isSource) { return `${column}=array_remove(${column}, $1)`; }
    return `${column}=array_append(array_remove(COALESCE(${column}, '{}'), $2), $2)`;
  });
  const studioStatement = sourceColumn === 'studio' && targetColumn === 'studio'
    ? 'studio=$2'
    : sourceColumn === 'studio'
      ? 'studio=NULL'
      : targetColumn === 'studio'
        ? 'studio=$2'
        : 'studio=studio';
  // Match array-backed values through ANY rather than casting the search
  // value to text[]. The media schema stores these columns as VARCHAR[] on
  // existing installations, and VARCHAR[] @> text[] is not a valid
  // PostgreSQL operator combination (which surfaced as a 500 on every save).
  const sourceWhere = sourceColumn === 'studio'
    ? 'studio=$1'
    : `$1=ANY(${sourceColumn})`;
  return safelyQuery(() => query(
    `UPDATE media SET ${[...setStatements, studioStatement].join(', ')} ` +
      `WHERE ${sourceWhere}`,
    [value, updatedValue],
  ), 'updateMediaLibraryValueGlobally');
};

export const addTagsToMedia = (tags: string[], photoIds: string[]) =>
  safelyQuery(() => query(`
    UPDATE media 
    SET tags = (
      SELECT array_agg(DISTINCT elem)
      FROM unnest(
        array_cat(tags, $1)
      ) AS elem
    )
    WHERE id = ANY($2)
  `, [
    convertArrayToPostgresString(tags),
    convertArrayToPostgresString(photoIds),
  ]), 'addTagsToMedia');

export const deleteMediaRecipeGlobally = (recipe: string) =>
  safelyQuery(() => sql`
    UPDATE media
    SET recipe_title=NULL
    WHERE recipe_title=${recipe}
  `, 'deleteMediaRecipeGlobally');

export const renameMediaRecipeGlobally = (
  recipe: string,
  updatedRecipe: string,
) =>
  safelyQuery(() => sql`
    UPDATE media
    SET recipe_title=${updatedRecipe}
    WHERE recipe_title=${recipe}
  `, 'renameMediaRecipeGlobally');

export const deleteMedia = (id: string) =>
  safelyQuery(() => sql`
    DELETE FROM media WHERE id=${id}
  `, 'deleteMedia');

export const consolidateDuplicateMediaRecords = (
  canonicalId: string,
  duplicateIds: string[],
) =>
  duplicateIds.length === 0
    ? Promise.resolve()
    : safelyQuery(async () => {
      const duplicateIdArray = convertArrayToPostgresString(duplicateIds);
      const hasAlbumMediaTable = await query<{ exists: boolean }>(`
        SELECT to_regclass('album_media') IS NOT NULL AS exists
      `).then(({ rows }) => rows[0]?.exists);

      if (hasAlbumMediaTable) {
        await query(`
          INSERT INTO album_media (album_id, media_id, sort_order)
          SELECT album_id, $1, sort_order
          FROM album_media
          WHERE media_id = ANY($2)
          ON CONFLICT (album_id, media_id) DO NOTHING
        `, [
          canonicalId,
          duplicateIdArray,
        ]);
      }

      return query(`
        DELETE FROM media
        WHERE id = ANY($1)
        AND id <> $2
      `, [
        duplicateIdArray,
        canonicalId,
      ]);
    }, 'consolidateDuplicateMediaRecords');

export const cleanupExactDuplicateMediaRecords = () =>
  safelyQuery(() => query(`
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
  `), 'cleanupExactDuplicateMediaRecords');

export const getMediaMostRecentUpdate = async () =>
  safelyQuery(() => sql`
    SELECT updated_at FROM media ORDER BY updated_at DESC LIMIT 1
  `.then(({ rows }) => rows[0] ? rows[0].updated_at as Date : undefined)
  , 'getMediaMostRecentUpdate');

export const getUniqueCameras = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT make||' '||model as camera, make, model,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE
    AND trim(make) <> ''
    AND trim(model) <> ''
    GROUP BY make, model
    ORDER BY camera ASC
  `.then(({ rows }): Cameras => rows.map(({
      make, model, count, last_modified,
    }) => ({
      cameraKey: createCameraKey({ make, model }),
      camera: { make, model },
      count: parseInt(count, 10), 
      lastModified: last_modified as Date,
    })))
  , 'getUniqueCameras');

export const getUniqueLenses = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT lens_make||' '||lens_model as lens,
      lens_make, lens_model,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE
    AND trim(lens_model) <> ''
    GROUP BY lens_make, lens_model
    ORDER BY lens ASC
  `.then(({ rows }): Lenses => rows
      .map(({ lens_make: make, lens_model: model, count, last_modified }) => ({
        lensKey: createLensKey({ make, model }),
        lens: { make, model },
        count: parseInt(count, 10), 
        lastModified: last_modified as Date,
      })))
  , 'getUniqueLenses');

export const getUniqueTags = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT unnest(tags) as tag,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE
    GROUP BY tag
    ORDER BY tag ASC
  `.then(({ rows }): Tags => rows.map(({ tag, count, last_modified }) => ({
      tag,
      count: parseInt(count, 10),
      lastModified: last_modified as Date,
    })))
  , 'getUniqueTags');

export const getUniqueCategories = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT unnest(categories) as category,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE
    AND categories IS NOT NULL
    GROUP BY category
    ORDER BY category ASC
  `.then(({ rows }) => rows.map(({ category, count, last_modified }) => ({
      category,
      count: parseInt(count, 10),
      lastModified: last_modified as Date,
    })))
  , 'getUniqueCategories');

export const getUniqueStudios = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT studio
    FROM media
    WHERE hidden IS NOT TRUE
    AND studio IS NOT NULL
    AND trim(studio) <> ''
    ORDER BY studio ASC
  `.then(({ rows }) =>
      rows
        .map(({ studio }) => studio?.trim())
        .filter((studio): studio is string => Boolean(studio)))
  , 'getUniqueStudios');

export const getUniqueStudiosWithMeta = async () =>
  safelyQuery(() => sql`
    SELECT studio,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE
    AND studio IS NOT NULL
    AND trim(studio) <> ''
    GROUP BY studio
    ORDER BY studio ASC
  `.then(({ rows }) => rows
      .map(({ studio, count, last_modified }) => ({
        studio: studio?.trim(),
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      }))
      .filter(({ studio }) => Boolean(studio)) as {
        studio: string
        count: number
        lastModified: Date
      }[])
  , 'getUniqueStudiosWithMeta');

export const getUniquePerformers = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT unnest(performers) as performer
    FROM media
    WHERE hidden IS NOT TRUE
    AND performers IS NOT NULL
    ORDER BY performer ASC
  `.then(({ rows }) =>
      rows
        .map(({ performer }) => performer?.trim())
        .filter((performer): performer is string => Boolean(performer)))
  , 'getUniquePerformers');

export const getUniquePerformersWithMeta = async () =>
  safelyQuery(() => sql`
    SELECT performer,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM (
      SELECT UNNEST(performers) AS performer, updated_at
      FROM media
      WHERE hidden IS NOT TRUE
      AND performers IS NOT NULL
    ) performer_rows
    WHERE performer IS NOT NULL
    AND trim(performer) <> ''
    GROUP BY performer
    ORDER BY performer ASC
  `.then(({ rows }) => rows
      .map(({ performer, count, last_modified }) => ({
        performer: performer?.trim(),
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      }))
      .filter(({ performer }) => Boolean(performer)) as {
        performer: string
        count: number
        lastModified: Date
      }[])
  , 'getUniquePerformersWithMeta');

export const getUniqueVideoContentTypes = async () =>
  safelyQuery(() => sql<{
    content_type: unknown
  }>`
    SELECT content_type
    FROM media
    WHERE hidden IS NOT TRUE
    AND content_type IS NOT NULL
  `.then(({ rows }) => Array.from(new Set(
      rows.flatMap(({ content_type }) => normalizeStoredArray(content_type))
        .map(contentType => contentType.trim())
        .filter((contentType): contentType is string => Boolean(contentType)),
    ))
      .sort((a, b) => a.localeCompare(b)))
  , 'getUniqueVideoContentTypes');

export const getUniqueVideoContentTypesWithMeta = async () =>
  safelyQuery(() => sql<{
    content_type: unknown
    updated_at: Date
  }>`
    SELECT content_type, updated_at
    FROM media
    WHERE hidden IS NOT TRUE
    AND content_type IS NOT NULL
  `.then(({ rows }) => {
      const contentTypes = new Map<string, {
        contentType: string
        count: number
        lastModified: Date
      }>();

      rows.forEach(({ content_type, updated_at }) => {
        normalizeStoredArray(content_type)
          .map(contentType => contentType.trim())
          .filter((contentType): contentType is string => Boolean(contentType))
          .forEach(contentType => {
            const existing = contentTypes.get(contentType);
            if (existing) {
              existing.count += 1;
              if (updated_at > existing.lastModified) {
                existing.lastModified = updated_at;
              }
              return;
            }

            contentTypes.set(contentType, {
              contentType,
              count: 1,
              lastModified: updated_at,
            });
          });
      });

      return Array.from(contentTypes.values())
        .sort((a, b) => a.contentType.localeCompare(b.contentType));
    })
  , 'getUniqueVideoContentTypesWithMeta');

export const getUniqueRecipes = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT recipe_title,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE AND recipe_title IS NOT NULL
    GROUP BY recipe_title
    ORDER BY recipe_title ASC
  `.then(({ rows }): Recipes => rows
      .map(({ recipe_title, count, last_modified }) => ({
        recipe: recipe_title,
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      })))
  , 'getUniqueRecipes');

export const getUniqueYears = async () =>
  safelyQuery(() => sql`
    SELECT
      DISTINCT EXTRACT(YEAR FROM taken_at) AS year,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE
    GROUP BY year
    ORDER BY year DESC
  `.then(({ rows }): Years => rows.map(({ year, count, last_modified }) => ({
      year,
      count: parseInt(count, 10),
      lastModified: last_modified as Date,
    }))), 'getUniqueYears');

export const getRecipeTitleForData = async (
  data: string | object,
  film: string,
) =>
  // Includes legacy check on pre-stringified JSON
  safelyQuery(() => sql`
    SELECT recipe_title FROM media
    WHERE hidden IS NOT TRUE
    AND recipe_data=${typeof data === 'string' ? data : JSON.stringify(data)}
    AND film=${film}
    LIMIT 1
  `
    .then(({ rows }) => rows[0]?.recipe_title as string | undefined)
  , 'getRecipeTitleForData');

export const getMediaNeedingRecipeTitleCount = async (
  data: string,
  film: string,
  photoIdToExclude?: string,
) =>
  safelyQuery(() => sql`
    SELECT COUNT(*)
    FROM media
    WHERE recipe_title IS NULL
    AND recipe_data=${data}
    AND film=${film}
    AND id <> ${photoIdToExclude}
  `.then(({ rows }) => parseInt(rows[0].count, 10))
  , 'getMediaNeedingRecipeTitleCount');

export const updateAllMatchingRecipeTitles = (
  title: string,
  data: string,
  film: string,
) =>
  safelyQuery(() => sql`
    UPDATE media
    SET recipe_title=${title}
    WHERE recipe_title IS NULL
    AND recipe_data=${data}
    AND film=${film}
  `, 'updateAllMatchingRecipeTitles');

export const getUniqueFilms = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT film,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE AND film IS NOT NULL
    GROUP BY film
    ORDER BY film ASC
  `.then(({ rows }): Films => rows
      .map(({ film, count, last_modified }) => ({
        film,
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      })))
  , 'getUniqueFilms');

export const getUniqueFocalLengths = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT focal_length,
      COUNT(*),
      MAX(updated_at) as last_modified
    FROM media
    WHERE hidden IS NOT TRUE AND focal_length IS NOT NULL
    GROUP BY focal_length
    ORDER BY focal_length ASC
  `.then(({ rows }): FocalLengths => rows
      .map(({ focal_length, count, last_modified }) => ({
        focal: parseInt(focal_length, 10),
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      })))
  , 'getUniqueFocalLengths');

const getMediaList = async (options: MediaQueryOptions = {}) =>
  safelyQuery(async () => {
    const shouldMergeVirtualVideos = optionsSupportVirtualStorageVideos(options);
    const dbOptions = shouldMergeVirtualVideos
      ? { ...options, limit: 10000, offset: 0 }
      : options;
    const sql = ['SELECT p.* FROM media p'];
    const values = [] as Primitive[];

    const joins = getJoinsFromOptions(dbOptions);

    if (joins) { sql.push(joins); }

    const {
      wheres,
      wheresValues,
      lastValuesIndex,
    } = getWheresFromOptions(dbOptions);
    
    if (wheres) {
      sql.push(wheres);
      values.push(...wheresValues);
    }

    sql.push(getOrderByFromOptions(dbOptions));

    const {
      limitAndOffset,
      limitAndOffsetValues,
    } = getLimitAndOffsetFromOptions(dbOptions, lastValuesIndex);

    // LIMIT + OFFSET
    sql.push(limitAndOffset);
    values.push(...limitAndOffsetValues);

    const dbMedia = await query(sql.join(' '), values)
      .then(({ rows }) =>
        dedupeMediaByStorageKey(parseMediaRowsSafely(rows as MediaDb[], 'getMedia')));
    const hydratedDbMedia = dbOptions.includeMissingStorageStatus
      ? await attachMissingStorageStatus(dbMedia)
      : dbMedia;

    if (!shouldMergeVirtualVideos) {
      return hydratedDbMedia;
    }

    const dbUrls = new Set(hydratedDbMedia.map(({ url }) => url));
    const dbIds = new Set(hydratedDbMedia.map(({ id }) => id));
    const virtualMedia = await getVirtualStorageVideoMediaItems()
      .then(photos => photos
        .filter(photo => !dbUrls.has(photo.url) && !dbIds.has(photo.id))
        .filter(photo => virtualMediaMatchesOptions(photo, options)))
      .catch(() => [] as Media[]);

    return applyLimitAndOffset(
      sortMediaForOptions([...hydratedDbMedia, ...virtualMedia], options),
      options,
    );
  },
  'getMedia',
  // Seemingly necessary to pass `options` for expected cache behavior
  options,
  );

export const getMediaNearId = async (
  photoId: string,
  options: MediaQueryOptions,
) =>
  safelyQuery(async () => {
    if (
      isVirtualStorageVideoId(photoId) ||
      optionsSupportVirtualStorageVideos(options)
    ) {
      const { limit = 20 } = options;
      const photos = await getMediaList({
        ...options,
        limit: 10000,
        offset: 0,
      });
      const currentIndex = photos.findIndex(photo => photo.id === photoId);
      const beforeCount = Math.max(0, Math.floor((limit - 1) / 2));
      const afterCount = Math.max(0, (limit - 1) - beforeCount);
      const start = Math.max(0, currentIndex - beforeCount);
      const end = currentIndex >= 0
        ? currentIndex + afterCount + 1
        : limit;
      return {
        photos: photos.slice(start, end),
        indexNumber: currentIndex >= 0 ? currentIndex + 1 : undefined,
      };
    }

    const { limit = 20 } = options;

    const beforeCount = Math.max(0, Math.floor((limit - 1) / 2));
    const afterCount = Math.max(0, (limit - 1) - beforeCount);

    const joins = getJoinsFromOptions(options);

    const {
      wheres,
      wheresValues,
      lastValuesIndex,
    } = getWheresFromOptions(options);

    let valuesIndex = lastValuesIndex;

    return query(
      `
        WITH deduped AS (
          SELECT DISTINCT ON (LOWER(p.url)) p.*
          FROM media p
          ${joins ? `${joins}` : ''}
          ${wheres}
          ORDER BY LOWER(p.url), p.created_at ASC, p.updated_at ASC, p.id ASC
        ),
        twi AS (
          SELECT deduped.*, row_number()
          OVER (${getOrderByFromOptions(options)}) as row_number
          FROM deduped
        ),
        current AS (SELECT row_number FROM twi WHERE id = $${valuesIndex++})
        SELECT twi.*
        FROM twi, current
        WHERE twi.row_number BETWEEN GREATEST(current.row_number - $${valuesIndex++}, 1)
                                 AND (current.row_number + $${valuesIndex++})
        ORDER BY twi.row_number
      `,
      [...wheresValues, photoId, beforeCount, afterCount],
      )
        .then(({ rows }) => {
          const photo = rows.find(({ id }) => id === photoId);
          const indexNumber = photo ? parseInt(photo.row_number) : undefined;
          return {
          photos: parseMediaRowsSafely(rows as MediaDb[], 'getMediaNearId'),
            indexNumber,
          };
        });
  }, `getMediaNearId: ${photoId}`);

// Background transcode helpers
export const countPendingVideoTranscodes = async () =>
  safelyQuery(async () => query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM media
      WHERE transcode_status='pending'
    `,
  ).then(({ rows }) => parseInt(rows[0]?.count || '0', 10)), 'countPendingVideoTranscodes');

export const countMediaProcessing = async () =>
  safelyQuery(async () => query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM media
      WHERE transcode_status IN ('pending','processing','failed')
    `,
  ).then(({ rows }) => parseInt(rows[0]?.count || '0', 10)), 'countMediaProcessing');

export const countActiveMediaProcessing = async () =>
  safelyQuery(async () => query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM media
      WHERE transcode_status IN ('pending','processing')
    `,
  ).then(({ rows }) => parseInt(rows[0]?.count || '0', 10)), 'countActiveMediaProcessing');

export const claimPendingVideoTranscodes = async (limit: number) =>
  safelyQuery(async () => query<{ id: string }>(
    `
      WITH cte AS (
        SELECT id
        FROM media
        WHERE transcode_status='pending'
        ORDER BY created_at DESC
        LIMIT $1
      )
      UPDATE media p
      SET transcode_status='processing', updated_at=now()
      WHERE p.id IN (SELECT id FROM cte)
      RETURNING p.id
    `,
    [limit],
  ).then(({ rows }) => rows.map(r => r.id)), 'claimPendingVideoTranscodes');

const pendingMediaProcessingWhere = `
  transcode_status IN ('pending','processing','failed')
`;

export const getPendingMediaProcessingCount = async () =>
  safelyQuery(
    () => query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM media
      WHERE ${pendingMediaProcessingWhere}
    `).then(({ rows }) => Number.parseInt(rows[0]?.count || '0', 10)),
    'getPendingMediaProcessingCount',
  );

export const getPendingMediaProcessing = async (limit = 1000, offset = 0) =>
  safelyQuery(
    () => query<MediaDb>(
      `
        SELECT *
        FROM media
        WHERE ${pendingMediaProcessingWhere}
        ORDER BY
          CASE transcode_status
            WHEN 'processing' THEN 0
            WHEN 'pending' THEN 1
            WHEN 'failed' THEN 2
          END,
          created_at DESC,
          id DESC
        LIMIT $1
        OFFSET $2
      `,
      [limit, offset],
    )
      .then(({ rows }) => parseMediaRowsSafely(rows as MediaDb[], 'getPendingMediaProcessing')),
    'getPendingMediaProcessing',
  );

/**
 * Fetch the processing page and its total from the same database snapshot.
 * The admin processing screen refreshes frequently; using a window count
 * avoids issuing a second full queue count query for every refresh.
 */
export const getPendingMediaProcessingPage = async (limit = 1000, offset = 0) =>
  safelyQuery(
    () => query<MediaDb & { __total: string }>(
      `
        SELECT media.*, COUNT(*) OVER()::text AS __total
        FROM media
        WHERE ${pendingMediaProcessingWhere}
        ORDER BY
          CASE transcode_status
            WHEN 'processing' THEN 0
            WHEN 'pending' THEN 1
            WHEN 'failed' THEN 2
          END,
          created_at DESC,
          id DESC
        LIMIT $1
        OFFSET $2
      `,
      [limit, offset],
    ).then(({ rows }) => ({
      total: Number.parseInt(rows[0]?.__total || '0', 10),
      items: parseMediaRowsSafely(
        rows as MediaDb[],
        'getPendingMediaProcessingPage',
      ),
    })),
    'getPendingMediaProcessingPage',
  );

export const getAllMediaStorageReferences = async () =>
  safelyQuery(
    () => query<{
      url: string
      poster_url: string | null
      preview_url: string | null
    }>(
      `
        SELECT url, poster_url, preview_url
        FROM media
      `,
    ).then(({ rows }) => rows.map(row => ({
      url: row.url,
      posterUrl: row.poster_url,
      previewUrl: row.preview_url,
    }))),
    'getAllMediaStorageReferences',
  );

export const markTranscodeFailed = async (photoId: string) =>
  safelyQuery(async () => query(
    `UPDATE media SET transcode_status='failed', updated_at=now() WHERE id=$1`,
    [photoId],
  ), `markTranscodeFailed: ${photoId}`);

export const retryStaleProcessing = async (minutes: number) =>
  safelyQuery(async () => query<{ updated: number }>(
    `
      WITH updated AS (
        UPDATE media
        SET transcode_status='failed', updated_at=now()
        WHERE transcode_status='processing'
          AND updated_at < (now() - ($1 || ' minutes')::interval)
        RETURNING 1
      )
      SELECT COUNT(*)::int AS updated FROM updated
    `,
    [String(minutes)],
  ).then(({ rows }) => rows[0]?.updated ?? 0), `retryStaleProcessing: ${minutes}`);

export const getMediaMeta = (options: MediaQueryOptions = {}) =>
  safelyQuery(async () => {
    let sql = `
      WITH deduped AS (
        SELECT DISTINCT ON (LOWER(p.url)) p.*
        FROM media p
    `;
    const joins = getJoinsFromOptions(options);
    if (joins) { sql += ` ${joins}`; }
    const { wheres, wheresValues } = getWheresFromOptions(options);
    if (wheres) { sql += ` ${wheres}`; }
    sql += `
        ORDER BY LOWER(p.url), p.created_at ASC, p.updated_at ASC, p.id ASC
      )
      SELECT COUNT(*), MIN(taken_at_naive) as start, MAX(taken_at_naive) as end
      FROM deduped
    `;
    const meta = await query(sql, wheresValues)
      .then(({ rows }) => ({
        count: parseInt(rows[0].count, 10),
        ...rows[0]?.start && rows[0]?.end
          ? { dateRange: {
            start: rows[0].start as string,
            end: rows[0].end as string,
          } as MediaDateRangePostgres }
          : undefined,
      }));

    if (!optionsSupportVirtualStorageVideos(options)) {
      return meta;
    }

    const dbMedia = await getMediaList({ ...options, limit: 10000, offset: 0 });
    const dbUrls = new Set(dbMedia
      .filter(({ id }) => !isVirtualStorageVideoId(id))
      .map(({ url }) => url));
    const virtualMedia = await getVirtualStorageVideoMediaItems()
      .then(photos => photos
        .filter(photo => !dbUrls.has(photo.url))
        .filter(photo => virtualMediaMatchesOptions(photo, options)))
      .catch(() => [] as Media[]);

    if (virtualMedia.length === 0) {
      return meta;
    }

    const dates = [
      meta.dateRange?.start,
      meta.dateRange?.end,
      ...virtualMedia.map(photo => photo.takenAtNaive),
    ].filter(Boolean).sort() as string[];

    return {
      count: meta.count + virtualMedia.length,
      dateRange: {
        start: dates[0],
        end: dates[dates.length - 1],
      } as MediaDateRangePostgres,
    };
  }, 'getMediaMeta');

export const getMediaTypeCounts = (options: MediaQueryOptions = {}) =>
  safelyQuery(async () => {
    let baseSql = `
      WITH deduped AS (
        SELECT DISTINCT ON (LOWER(p.url)) p.*
        FROM media p
    `;
    const joins = getJoinsFromOptions(options);
    if (joins) { baseSql += ` ${joins}`; }
    const { wheres, wheresValues } = getWheresFromOptions(options);
    if (wheres) { baseSql += ` ${wheres}`; }
    baseSql += `
        ORDER BY LOWER(p.url), p.created_at ASC, p.updated_at ASC, p.id ASC
      )
      SELECT 
        COUNT(*) FILTER (WHERE media_type='photo')::int AS photos,
        COUNT(*) FILTER (WHERE media_type='video')::int AS videos,
        COUNT(*)::int AS total
      FROM deduped
    `;
    return query(baseSql, wheresValues)
      .then(({ rows }) => ({
        photos: rows[0] ? parseInt(rows[0].photos, 10) : 0,
        videos: rows[0] ? parseInt(rows[0].videos, 10) : 0,
        total: rows[0] ? parseInt(rows[0].total, 10) : 0,
      }));
  }, 'getMediaTypeCounts');

export const getPublicMediaIds = async ({ limit }: { limit?: number }) =>
  safelyQuery(() => (limit
    ? sql`SELECT id FROM media WHERE hidden IS NOT TRUE LIMIT ${limit}`
    : sql`SELECT id FROM media WHERE hidden IS NOT TRUE`)
    .then(({ rows }) => rows.map(({ id }) => id as string))
  , 'getPublicMediaIds');

export const getMediaIdsAndUpdatedAt = async () =>
  safelyQuery(() =>
    sql`SELECT id, updated_at FROM media WHERE hidden IS NOT TRUE`
      .then(({ rows }) => rows.map(({ id, updated_at }) =>
        ({ id: id as string, updatedAt: updated_at as Date })))
  , 'getMediaIdsAndUpdatedAt');

const getMediaItem = async (
  id: string,
  includeHidden?: boolean,
): Promise<Media | undefined> =>
  safelyQuery(async () => {
      const virtualMedia = await getVirtualStorageVideoMedia(id);
      if (virtualMedia) {
        return includeHidden || !virtualMedia.hidden ? virtualMedia : undefined;
      }

    // Check for photo id forwarding and convert short ids to uuids
    const photoId = translateMediaId(id);
      return (includeHidden
        ? sql<MediaDb>`SELECT * FROM media WHERE id=${photoId} LIMIT 1`
        // eslint-disable-next-line max-len
        : sql<MediaDb>`SELECT * FROM media WHERE id=${photoId} AND hidden IS NOT TRUE LIMIT 1`)
        .then(({ rows }) => parseMediaRowsSafely(rows, 'getMediaItem'))
        .then(photos => photos.length > 0 ? photos[0] : undefined);
    }, 'getMediaItem');

export function getMedia(id: string, includeHidden?: boolean): Promise<Media | undefined>;
export function getMedia(options?: MediaQueryOptions): Promise<Media[]>;
export function getMedia(
  arg?: string | MediaQueryOptions,
  includeHidden?: boolean,
) {
  return typeof arg === 'string'
    ? getMediaItem(arg, includeHidden)
    : getMediaList(arg ?? {});
}

export const getMediaByStorageUrl = async (url: string) =>
  safelyQuery(
    () => sql<MediaDb>`SELECT * FROM media WHERE url=${url} ORDER BY created_at ASC`
      .then(({ rows }) => parseMediaRowsSafely(rows, 'getMediaByStorageUrl')),
    'getMediaByStorageUrl',
  );

export const getFirstMediaByStorageUrl = async (url: string) =>
  getMediaByStorageUrl(url).then(photos =>
    photos.length > 0 ? photos[0] : undefined,
  );

export const getMediaByFileNameBase = async (fileNameBase: string) =>
  safelyQuery(
    () => sql<MediaDb>`
      SELECT * FROM media
      WHERE
        url ILIKE ${`%/${fileNameBase}.%`} OR
        url ILIKE ${`%/${fileNameBase}-%`}
      ORDER BY updated_at DESC
      LIMIT 1
    `.then(({ rows }) => parseMediaRowsSafely(rows, 'getMediaByFileNameBase'))
      .then(photos => photos.length > 0 ? photos[0] : undefined),
    'getMediaByFileNameBase',
  );

export const getMediaItemsByFileNameBase = async (fileNameBase: string) =>
  safelyQuery(
    () => sql<MediaDb>`
      SELECT * FROM media
      WHERE
        url ILIKE ${`%/${fileNameBase}.%`} OR
        url ILIKE ${`%/${fileNameBase}-%`}
      ORDER BY created_at ASC, updated_at ASC
    `.then(({ rows }) => parseMediaRowsSafely(rows, 'getMediaItemsByFileNameBase')),
    'getMediaItemsByFileNameBase',
  );

// Update queries

const outdatedWhereClauses = [
  `updated_at < $1`,
];

const outdatedWhereValues = [
  OUTDATED_UPDATE_AT_THRESHOLD.toISOString(),
];

const needsAiTextWhereClauses =
  AI_CONTENT_GENERATION_ENABLED
    ? AI_TEXT_AUTO_GENERATED_FIELDS
      .map(field => {
        switch (field) {
          case 'title': return `(title <> '') IS NOT TRUE`;
          case 'caption': return `(caption <> '') IS NOT TRUE`;
          case 'tags': return `(tags IS NULL OR array_length(tags, 1) = 0)`;
          case 'semantic': return `(semantic_description <> '') IS NOT TRUE`;
        }
      })
    : [];

const needsColorDataWhereClauses = COLOR_SORT_ENABLED
  ? [`(
    color_data IS NULL OR
    color_sort IS NULL
  )`]
  : [];

const needsSyncWhereStatement =
  `WHERE ${[
    ...outdatedWhereClauses,
    ...needsAiTextWhereClauses,
    ...needsColorDataWhereClauses,
  ].join(' OR ')}`;

export const getMediaInNeedOfUpdate = () =>
  safelyQuery(
    () => query(`
      SELECT * FROM media
      ${needsSyncWhereStatement}
      ORDER BY created_at DESC
      LIMIT ${UPDATE_QUERY_LIMIT}
    `,
    outdatedWhereValues,
    )
      .then(({ rows }) => parseMediaRowsSafely(rows as MediaDb[], 'getMediaInNeedOfUpdate')),
    'getMediaInNeedOfUpdate',
  );

export const getMediaInNeedOfUpdateCount = () =>
  safelyQuery(
    () => query(`
      SELECT COUNT(*) FROM media
      ${needsSyncWhereStatement}
    `,
    outdatedWhereValues,
    )
      .then(({ rows }) => parseInt(rows[0].count, 10)),
    'getMediaInNeedOfUpdateCount',
  );

// Backfills and experimentation

export const getColorDataForMedia = () =>
  safelyQuery(() => sql<{
    id: string,
    url: string,
    color_data?: MediaColorData,
  }>`
    SELECT id, url, color_data FROM media
    LIMIT ${UPDATE_QUERY_LIMIT}
  `.then(({ rows }) => rows.map(({ id, url, color_data }) =>
        ({ id, url, colorData: color_data })))
  , 'getColorDataForMedia');

export const updateColorDataForMedia = (
  photoId: string,
  colorData: string,
  colorSort: number,
) =>
  safelyQuery(
    () => sql`
      UPDATE media SET
      color_data=${colorData},
      color_sort=${colorSort}
      WHERE id=${photoId}
    `,
    'updateColorDataForMedia',
  );
