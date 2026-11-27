'use server';

import { query } from '@/platforms/postgres';
import {
  getCurrentStorageInventoryPage,
  getFileNamePartsFromStorageUrl,
  getStorageKeyFromUrl,
  storageTypeFromUrl,
  type StorageListItem,
} from '@/platforms/storage';
import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { mapWithConcurrency } from '@/utility/concurrency';

type MediaRow = {
  id: string
  url: string
  title?: string | null
  poster_url?: string | null
  preview_url?: string | null
  hls_manifest_url?: string | null
};

type MapRow = {
  media_id: string
  original_file_name: string
  stored_file_name: string
  stored_url: string
  source_url: string
  updated_at?: string | Date | null
};

type Relation = {
  kind: 'media' | 'source' | 'canonical' | 'worker' | 'deletion' | 'hint' | 'title'
  label: string
  mediaId?: string
  title?: string
};

export type StorageCleanupItem = {
  key: string
  url: string
  sizeBytes?: number
  uploadedAt?: string
  relations: Relation[]
  sourceKey?: string
  canonicalKey?: string
  canonicalSizeBytes?: number
  classification: 'linked' | 'source-cleanup' | 'unreferenced' | 'stale-generated'
  canDelete: boolean
  reason: string
};

export type StorageCleanupSnapshot = {
  checkedAt: string
  provider: string
  totalObjects: number
  items: StorageCleanupItem[]
  errors: string[]
  nextCursor?: string
  scannedObjects: number
  deletionUnavailableReason: string
};

// The Drive gateway and Cloudflare R2 delete by key. A listing or HEAD check
// can become stale before either provider executes that delete.
const DELETION_UNAVAILABLE = 'The storage provider cannot verify the object ' +
  'version during deletion. This audit is read-only.';

const keyFromUrl = (url: string) => {
  try {
    return getStorageKeyFromUrl(url);
  } catch {
    return getFileNamePartsFromStorageUrl(url).fileName;
  }
};

const matchesStoredObject = (object: StorageListItem, storedUrl: string) => {
  try {
    const provider = storageTypeFromUrl(storedUrl);
    return storageTypeFromUrl(object.url) === provider &&
      getStorageKeyFromUrl(storedUrl, provider) === object.fileName &&
      getStorageKeyFromUrl(object.url, provider) === object.fileName;
  } catch {
    return false;
  }
};

const normalized = (value: string) => value
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// An incomplete reference inventory must never classify objects as deletable.
const safeQuery = async <T extends import('pg').QueryResultRow>(sql: string): Promise<T[]> =>
  (await query<T>(sql)).rows;

const readOptionalAuditRows = async <T extends import('pg').QueryResultRow>(
  table: 'registered_upload_file_map' | 'worker_registration_status' |
    'upload_registration_hints' | 'media_deletion_queue',
  columns: string,
) => {
  try {
    return { rows: await safeQuery<T>(`SELECT ${columns} FROM ${table}`) };
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) ||
        error.code !== '42P01') { throw error; }
    return { rows: [] as T[], missingTable: table };
  }
};

const hasConsistentCopyTimestamps = (
  source: StorageListItem,
  canonical: StorageListItem,
  registeredAt: MapRow['updated_at'],
) => {
  if (!source.uploadedAt || !canonical.uploadedAt || !registeredAt) {
    return false;
  }
  const sourceTime = source.uploadedAt.getTime();
  const canonicalTime = canonical.uploadedAt.getTime();
  const registrationTime = new Date(registeredAt).getTime();
  return sourceTime <= canonicalTime && canonicalTime <= registrationTime;
};

const getStorageItemByKey = async (key: string) => {
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await getCurrentStorageInventoryPage(key, cursor);
    const item = page.objects.find(object => object.fileName === key);
    cursor = page.nextContinuationToken;
    if (item || !cursor) { return item; }
    if (seenCursors.has(cursor)) {
      throw new Error('The storage inventory repeated a continuation token.');
    }
    seenCursors.add(cursor);
  }
};

const buildSnapshot = async (
  cursor?: string,
): Promise<StorageCleanupSnapshot> => {
  const [inventory, media, maps, statuses, hints, deletions] = await Promise.all([
    getCurrentStorageInventoryPage('', cursor),
    safeQuery<MediaRow>(`
      SELECT id, url, title, poster_url, preview_url, hls_manifest_url
      FROM media
    `),
    readOptionalAuditRows<MapRow>(
      'registered_upload_file_map',
      'media_id, original_file_name, stored_file_name, stored_url, source_url, updated_at',
    ),
    readOptionalAuditRows<{
      url: string
      source_url?: string | null
      media_id?: string | null
      title?: string | null
    }>('worker_registration_status', 'url, source_url, media_id, title'),
    readOptionalAuditRows<{
      url: string
      original_file_name?: string | null
      title?: string | null
    }>('upload_registration_hints', 'url, original_file_name, title'),
    readOptionalAuditRows<{
      urls?: unknown
      prefixes?: unknown
      media_id?: string | null
      title?: string | null
    }>('media_deletion_queue', 'urls, prefixes, media_id, title'),
  ]);
  const missingTables = [maps, statuses, hints, deletions]
    .flatMap(result => result.missingTable ? [result.missingTable] : []);

  const relations = new Map<string, Relation[]>();
  const add = (key: string, relation: Relation) => {
    if (!key) return;
    const current = relations.get(key) || [];
    if (!current.some(item => item.kind === relation.kind && item.label === relation.label)) {
      current.push(relation);
    }
    relations.set(key, current);
  };
  const mediaById = new Map(media.map(row => [row.id, row]));
  const liveDerivativePrefixes: Array<{ prefix: string; media: MediaRow }> = [];
  const titleIndex = new Map<string, MediaRow[]>();
  media.forEach(row => {
    const title = normalized(row.title || '');
    if (title) titleIndex.set(title, [...(titleIndex.get(title) || []), row]);
    for (const [field, value] of Object.entries({
      media: row.url,
      poster: row.poster_url,
      preview: row.preview_url,
      hls: row.hls_manifest_url,
    })) {
      if (value) add(keyFromUrl(value), { kind: 'media', label: `media.${field}`, mediaId: row.id, title: row.title || undefined });
    }
    const sourceKey = keyFromUrl(row.url);
    const sourceBase = sourceKey.replace(/\.[^/.]+$/, '');
    if (sourceBase) {
      liveDerivativePrefixes.push({ prefix: `${sourceBase}-`, media: row });
    }
  });
  const mapBySource = new Map<string, MapRow | undefined>();
  const inventoryByKey = new Map(inventory.objects.map(object => [object.fileName, object]));
  maps.rows.forEach(row => {
    const sourceKey = keyFromUrl(row.source_url);
    const canonicalKey = keyFromUrl(row.stored_url);
    mapBySource.set(sourceKey, mapBySource.has(sourceKey) ? undefined : row);
    add(sourceKey, { kind: 'source', label: `registered source: ${row.original_file_name}`, mediaId: row.media_id });
    add(canonicalKey, { kind: 'canonical', label: `canonical file: ${row.stored_file_name}`, mediaId: row.media_id });
    const title = normalized(row.original_file_name);
    titleIndex.get(title)?.forEach(mediaRow => add(sourceKey, {
      kind: 'title',
      label: `filename matches title: ${mediaRow.title || row.original_file_name}`,
      mediaId: mediaRow.id,
      title: mediaRow.title || undefined,
    }));
  });
  statuses.rows.forEach(row => {
    add(keyFromUrl(row.url), { kind: 'worker', label: `worker status${row.media_id ? ` for ${row.media_id}` : ''}`, mediaId: row.media_id || undefined, title: row.title || undefined });
    if (row.source_url) add(keyFromUrl(row.source_url), { kind: 'worker', label: 'worker source status', mediaId: row.media_id || undefined, title: row.title || undefined });
  });
  hints.rows.forEach(row => add(keyFromUrl(row.url), { kind: 'hint', label: 'upload registration hint', title: row.title || row.original_file_name || undefined }));
  const deletionPrefixes: Array<{ prefix: string; relation: Relation }> = [];
  const addJsonKeys = (value: unknown, relation: Relation, asPrefix = false) => {
    const values = Array.isArray(value) ? value : [];
    values.forEach(item => {
      if (typeof item === 'string') {
        const key = keyFromUrl(item);
        if (asPrefix && key) deletionPrefixes.push({ prefix: key, relation });
        else add(key, relation);
      }
    });
  };
  deletions.rows.forEach(row => {
    const relation = { kind: 'deletion' as const, label: `deletion queue${row.media_id ? ` for ${row.media_id}` : ''}`, mediaId: row.media_id || undefined, title: row.title || undefined };
    addJsonKeys(row.urls, relation);
    addJsonKeys(row.prefixes, relation, true);
  });

  const replacementLookups = new Map<string, Promise<StorageListItem | undefined>>();
  let replacementLookupFailed = false;
  const getReplacement = (key: string) => {
    const existing = replacementLookups.get(key);
    if (existing) { return existing; }
    const lookup = getStorageItemByKey(key);
    replacementLookups.set(key, lookup);
    return lookup;
  };

  const items = await mapWithConcurrency(inventory.objects, 4, async (
    object: StorageListItem,
  ): Promise<StorageCleanupItem> => {
    const key = object.fileName;
    const itemRelations = [...(relations.get(key) || [])];
    deletionPrefixes.forEach(({ prefix, relation }) => {
      if (key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}-`)) add(key, relation);
    });
    itemRelations.push(...(relations.get(key) || []).filter(relation => !itemRelations.some(existing => existing.kind === relation.kind && existing.label === relation.label)));
    const idMatch = key.match(/^(\d{12})(?:-[^.]+)?\.[^.]+$/);
    const idMedia = idMatch ? mediaById.get(idMatch[1]) : undefined;
    if (idMedia && !itemRelations.some(item => item.mediaId === idMedia.id)) {
      itemRelations.push({ kind: 'canonical', label: `numeric ID matches media ${idMedia.id}`, mediaId: idMedia.id, title: idMedia.title || undefined });
    }
    liveDerivativePrefixes.forEach(({ prefix, media: mediaRow }) => {
      if (key.startsWith(prefix) && !itemRelations.some(item => item.mediaId === mediaRow.id)) {
        itemRelations.push({
          kind: 'media',
          label: `possible derivative of media ${mediaRow.id}`,
          mediaId: mediaRow.id,
          title: mediaRow.title || undefined,
        });
      }
    });
    const map = mapBySource.get(key);
    const canonicalKey = map ? keyFromUrl(map.stored_url) : undefined;
    const activeMedia = map?.media_id ? mediaById.get(map.media_id) : undefined;
    let canonical: StorageListItem | undefined;
    if (
      missingTables.length === 0 && map && canonicalKey && canonicalKey !== key &&
      activeMedia?.url === map.stored_url &&
      matchesStoredObject(object, map.source_url) &&
      itemRelations.every(relation => relation.kind === 'source' || relation.kind === 'title') &&
      object.sizeBytes !== undefined
    ) {
      try {
        canonical = inventoryByKey.get(canonicalKey) ??
          await getReplacement(canonicalKey);
      } catch {
        replacementLookupFailed = true;
      }
    }
    const isSourceCleanup = Boolean(
      map && canonical && matchesStoredObject(canonical, map.stored_url) &&
      canonical.sizeBytes !== undefined &&
      object.sizeBytes === canonical.sizeBytes &&
      hasConsistentCopyTimestamps(object, canonical, map.updated_at),
    );
    const generated = /(?:-poster|-preview|-stream|-sm|-md|-lg|-hls(?:-|\.)|-segment-)/i.test(key);
    const classification = isSourceCleanup
      ? 'source-cleanup'
      : itemRelations.length === 0 && generated
        ? 'stale-generated'
        : itemRelations.length === 0 ? 'unreferenced' : 'linked';
    return {
      key,
      url: object.url,
      sizeBytes: object.sizeBytes,
      uploadedAt: object.uploadedAt?.toISOString(),
      relations: itemRelations,
      sourceKey: isSourceCleanup ? key : undefined,
      canonicalKey: isSourceCleanup ? canonicalKey : undefined,
      canonicalSizeBytes: isSourceCleanup ? canonical?.sizeBytes : undefined,
      classification,
      canDelete: false,
      reason: isSourceCleanup
        ? `Registered replacement ${canonicalKey} matches the source size and copy timestamps.`
        : itemRelations.length > 0
          ? 'Linked to database or registration data; deletion is blocked.'
          : generated
            ? 'Generated artifact has no current media reference.'
            : 'No database or registration relationship was found.'
    };
  });
  items.sort((a, b) =>
    Number(b.classification === 'source-cleanup') -
    Number(a.classification === 'source-cleanup') || a.key.localeCompare(b.key));

  return {
    checkedAt: new Date().toISOString(),
    provider: inventory.provider,
    totalObjects: inventory.objects.length,
    items,
    errors: [
      ...(missingTables.length ? [
        `Cleanup is unavailable while audit tables are missing: ${missingTables.join(', ')}.`,
      ] : []),
      ...(replacementLookupFailed ? [
        'Unable to verify some storage replacements. Refresh the audit to try again.',
      ] : []),
    ],
    nextCursor: inventory.nextContinuationToken,
    scannedObjects: inventory.objects.length,
    deletionUnavailableReason: DELETION_UNAVAILABLE,
  };
};

export const getStorageCleanupSnapshot = async (cursor?: string) =>
  runAuthenticatedAdminServerAction(() => buildSnapshot(cursor), 'manage-configuration');

export const deleteStorageCleanupItem = async (_key: string) =>
  runAuthenticatedAdminServerAction(() => {
    throw new Error(DELETION_UNAVAILABLE);
  }, 'manage-configuration');

export const deleteStorageCleanupItems = async (keys: string[]) =>
  runAuthenticatedAdminServerAction(() => ({
    deleted: [],
    skipped: Array.from(new Set(keys)).slice(0, 50),
    failed: [],
    reason: DELETION_UNAVAILABLE,
  }), 'manage-configuration');
