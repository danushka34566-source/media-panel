import { parameterize } from '@/utility/string';
import { MediaSetCategory } from '@/category';
import { Camera } from '@/camera';
import { Lens } from '@/lens';
import { SortBy } from '@/media/sort';
import { USER_DEFAULT_SORT_BY } from '@/app/config';
import { Album } from '@/album';

export const GENERATE_STATIC_PARAMS_LIMIT = 1000;
export const MEDIA_DEFAULT_LIMIT = 100;

// These must mirror utility/string.ts parameterization
const CHARACTERS_TO_REMOVE = [',', '/'];
const CHARACTERS_TO_REPLACE = ['+', '&', '|', ':', '_', ' '];

const parameterizeForDb = (field: string) =>
  `REGEXP_REPLACE(
    REGEXP_REPLACE(
      LOWER(TRIM(${field})),
      '[${CHARACTERS_TO_REMOVE.join('')}]', '', 'g'
    ),
    '[${CHARACTERS_TO_REPLACE.join('')}]', '-', 'g'
  )`;

const buildSearchDocument = () =>
  `CONCAT_WS(' ',
    COALESCE(id::text, ''),
    COALESCE(url, ''),
    COALESCE(title, ''),
    COALESCE(caption, ''),
    COALESCE(semantic_description, ''),
    COALESCE(tags::text, ''),
    COALESCE(categories::text, ''),
    COALESCE(studio, ''),
    COALESCE(content_type::text, ''),
    COALESCE(performers::text, ''),
    COALESCE(make, ''),
    COALESCE(model, ''),
    COALESCE(lens_make, ''),
    COALESCE(lens_model, ''),
    COALESCE(film, ''),
    COALESCE(recipe_title, ''),
    COALESCE(location_name, ''),
    COALESCE(media_type::text, ''),
    COALESCE(extension, ''),
    COALESCE(taken_at_naive::text, '')
  )`;

export type MediaQueryOptions = {
  sortBy?: SortBy
  sortWithPriority?: boolean
  limit?: number
  offset?: number
  query?: string
  ids?: string[]
  excludeIds?: string[]
  maximumAspectRatio?: number
  takenBefore?: Date
  takenAfterInclusive?: Date
  updatedBefore?: Date
  excludeFromFeeds?: boolean
  hidden?: 'exclude' | 'include' | 'only'
  includeMissingStorageStatus?: boolean
} & Omit<MediaSetCategory, 'camera' | 'lens' | 'album'> & {
  camera?: Partial<Camera>
  lens?: Partial<Lens>
  album?: Album
};

export const areOptionsSensitive = (options: MediaQueryOptions) =>
  options.hidden === 'include' || options.hidden === 'only';

const orderBy = (...clauses: string[]) => `ORDER BY ${clauses.join(', ')}`;

export const getJoinsFromOptions = (options: MediaQueryOptions) =>
  options.album
    ? 'JOIN album_media ap ON ap.media_id = p.id'
    : undefined;

export const getWheresFromOptions = (
  options: MediaQueryOptions,
  initialValuesIndex = 1,
) => {
  const {
    hidden = 'exclude',
    excludeFromFeeds,
    takenBefore,
    takenAfterInclusive,
    updatedBefore,
    query,
    ids,
    excludeIds,
    maximumAspectRatio,
    recent,
    year,
    album,
    tag,
    camera,
    lens,
    film,
    recipe,
  focal,
    category,
    studio,
    performer,
    contentType,
  } = options;

  const wheres = [] as string[];
  const wheresValues = [] as (string | number | readonly string[])[];
  let valuesIndex = initialValuesIndex;

  switch (hidden) {
    case 'exclude':
      wheres.push('hidden IS NOT TRUE');
      break;
    case 'only':
      wheres.push('hidden IS TRUE');
      break;
  }

  if (excludeFromFeeds) {
    wheres.push('exclude_from_feeds IS NOT TRUE');
  }
  if (takenBefore) {
    wheres.push(`taken_at < $${valuesIndex++}`);
    wheresValues.push(takenBefore.toISOString());
  }
  if (takenAfterInclusive) {
    wheres.push(`taken_at >= $${valuesIndex++}`);
    wheresValues.push(takenAfterInclusive.toISOString());
  }
  if (updatedBefore) {
    wheres.push(`updated_at < $${valuesIndex++}`);
    wheresValues.push(updatedBefore.toISOString());
  }
  if (query) {
    const searchPatterns = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(term => `%${term}%`);
    if (searchPatterns.length > 0) {
      // Match every word without requiring one exact contiguous phrase. A
      // single text-array parameter keeps placeholder generation stable for
      // command-panel and full search-page pagination.
      wheres.push(
        `${buildSearchDocument()} ILIKE ALL($${valuesIndex++}::text[])`,
      );
      wheresValues.push(searchPatterns);
    }
  }
  if (ids) {
    wheres.push(`id = ANY($${valuesIndex++}::text[])`);
    wheresValues.push(ids);
  }
  if (excludeIds && excludeIds.length > 0) {
    wheres.push(`NOT (id = ANY($${valuesIndex++}::text[]))`);
    wheresValues.push(excludeIds);
  }
  if (maximumAspectRatio) {
    wheres.push(`aspect_ratio <= $${valuesIndex++}`);
    wheresValues.push(maximumAspectRatio);
  }
  if (recent) {
    // Newest upload must be within past 2 weeks
    // eslint-disable-next-line max-len
    wheres.push('(SELECT MAX(created_at) FROM media) >= (now() - INTERVAL \'14 days\')');
    // Selects must be within 1 week of newest upload
    // eslint-disable-next-line max-len
    wheres.push('created_at >= (SELECT MAX(created_at) - INTERVAL \'7 days\' FROM media)');
  }
  if (year) {
    wheres.push(`EXTRACT(YEAR FROM taken_at) = $${valuesIndex++}`);
    wheresValues.push(year);
  }
  if (camera?.make) {
    wheres.push(`${parameterizeForDb('make')}=$${valuesIndex++}`);
    wheresValues.push(parameterize(camera.make));
  }
  if (camera?.model) {
    wheres.push(`${parameterizeForDb('model')}=$${valuesIndex++}`);
    wheresValues.push(parameterize(camera.model));
  }
  if (lens?.make) {
    wheres.push(`${parameterizeForDb('lens_make')}=$${valuesIndex++}`);
    wheresValues.push(parameterize(lens.make));
  }
  if (lens?.model) {
    wheres.push(`${parameterizeForDb('lens_model')}=$${valuesIndex++}`);
    // Ensure unique queries for lenses missing makes
    if (!lens.make) { wheres.push('lens_make IS NULL'); }
    wheresValues.push(parameterize(lens.model));
  }
  if (album) {
    wheres.push(`album_id=$${valuesIndex++}`);
    wheresValues.push(album.id);
  }
  if (tag) {
    wheres.push(`$${valuesIndex++}=ANY(tags)`);
    wheresValues.push(tag);
  }
  if (film) {
    wheres.push(`film=$${valuesIndex++}`);
    wheresValues.push(film);
  }
  if (recipe) {
    wheres.push(`recipe_title=$${valuesIndex++}`);
    wheresValues.push(recipe);
  }
  if (focal) {
    wheres.push(`focal_length=$${valuesIndex++}`);
    wheresValues.push(focal);
  }
  if (category) {
    wheres.push(`$${valuesIndex++}=ANY(categories)`);
    wheresValues.push(category);
  }
  if (studio) {
    wheres.push(`studio=$${valuesIndex++}`);
    wheresValues.push(studio);
  }
  if (performer) {
    wheres.push(`$${valuesIndex++}=ANY(performers)`);
    wheresValues.push(performer);
  }
  if (contentType) {
    wheres.push(`COALESCE(content_type::text, '') ILIKE $${valuesIndex++}`);
    wheresValues.push(`%${contentType}%`);
  }

  return {
    wheres: wheres.length > 0
      ? `WHERE ${wheres.join(' AND ')}`
      : '',
    wheresValues,
    lastValuesIndex: valuesIndex,
  };
};

export const getOrderByFromOptions = (options: MediaQueryOptions) => {
  const {
    sortBy = USER_DEFAULT_SORT_BY,
    sortWithPriority,
  } = options;

  switch (sortBy) {
    case 'takenAt':
      return sortWithPriority
        ? orderBy(
          'priority_order ASC',
          'taken_at DESC',
          'created_at DESC',
          'id DESC',
        )
        : orderBy('taken_at DESC', 'created_at DESC', 'id DESC');
    case 'takenAtAsc':
      return sortWithPriority
        ? orderBy(
          'priority_order ASC',
          'taken_at ASC',
          'created_at ASC',
          'id ASC',
        )
        : orderBy('taken_at ASC', 'created_at ASC', 'id ASC');
    case 'createdAt':
      return sortWithPriority
        ? orderBy('priority_order ASC', 'created_at DESC', 'id DESC')
        : orderBy('created_at DESC', 'id DESC');
    case 'createdAtAsc':
      return sortWithPriority
        ? orderBy('priority_order ASC', 'created_at ASC', 'id ASC')
        : orderBy('created_at ASC', 'id ASC');
      // Add date sort to account for photos with same color sort
    case 'color':
      return sortWithPriority
        ? orderBy(
          'priority_order ASC',
          'color_sort DESC',
          'taken_at DESC',
          'created_at DESC',
          'id DESC',
        )
        : orderBy(
          'color_sort DESC',
          'taken_at DESC',
          'created_at DESC',
          'id DESC',
        );
    case 'colorAsc':
      return sortWithPriority
        ? orderBy(
          'priority_order ASC',
          'color_sort ASC',
          'taken_at ASC',
          'created_at ASC',
          'id ASC',
        )
        : orderBy(
          'color_sort ASC',
          'taken_at ASC',
          'created_at ASC',
          'id ASC',
        );
  }
};

export const getLimitAndOffsetFromOptions = (
  options: MediaQueryOptions,
  initialValuesIndex = 1,
) => {
  const {
    limit = MEDIA_DEFAULT_LIMIT,
    offset = 0,
  } = options;

  let valuesIndex = initialValuesIndex;

  return {
    limitAndOffset: `LIMIT $${valuesIndex++} OFFSET $${valuesIndex++}`,
    limitAndOffsetValues: [limit, offset],
  };
};

export const convertArrayToPostgresString = (
  array?: string[],
  type: 'braces' | 'brackets' | 'parentheses' = 'braces', 
) => array
  ? type === 'braces'
    ? `{${array.join(',')}}`
    : type === 'brackets'
      ? `[${array.map(i => `'${i}'`).join(',')}]`
      : `(${array.map(i => `'${i}'`).join(',')})`
  : null;

export const generateManyToManyValues = (idsA: string[], idsB: string[]) => {
  const pairs: string[][] = [];

  for (const idA of idsA) {
    for (const idB of idsB) {
      pairs.push([idA, idB]);
    }
  }
  const valueString = 'VALUES ' + pairs.map((_, index) =>
    `($${index * 2 + 1},$${index * 2 + 2})`).join(',');

  const values = pairs.flat();
  
  return {
    valueString,
    values,
  };
};
