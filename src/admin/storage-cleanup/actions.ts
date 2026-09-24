'use server';

import { query } from '@/platforms/postgres';
import {
  deleteFile,
  getCurrentStorageInventoryPage,
  getFileNamePartsFromStorageUrl,
  type StorageListItem,
} from '@/platforms/storage';
import { runAuthenticatedAdminServerAction } from '@/auth/server';

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
};

const keyFromUrl = (url: string) => {
  try {
    return getFileNamePartsFromStorageUrl(url).fileName;
  } catch {
    return '';
  }
};

const normalized = (value: string) => value
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// An incomplete reference inventory must never classify objects as deletable.
const safeQuery = async <T extends import('pg').QueryResultRow>(sql: string): Promise<T[]> =>
  (await query<T>(sql)).rows;

const buildSnapshot = async (prefix = '', cursor?: string): Promise<StorageCleanupSnapshot> => {
  const [inventory, media, maps, statuses, hints, deletions] = await Promise.all([
    getCurrentStorageInventoryPage(prefix, cursor, 250),
    safeQuery<MediaRow>(`
      SELECT id, url, title, poster_url, preview_url, hls_manifest_url
      FROM media
    `),
    safeQuery<MapRow>(`
      SELECT media_id, original_file_name, stored_file_name,
        stored_url, source_url, updated_at
      FROM registered_upload_file_map
    `),
    safeQuery<{ url: string; source_url?: string | null; media_id?: string | null; title?: string | null }>(`
      SELECT url, source_url, media_id, title
      FROM worker_registration_status
    `),
    safeQuery<{ url: string; original_file_name?: string | null; title?: string | null }>(`
      SELECT url, original_file_name, title
      FROM upload_registration_hints
    `),
    safeQuery<{ urls?: unknown; prefixes?: unknown; media_id?: string | null; title?: string | null }>(`
      SELECT urls, prefixes, media_id, title
      FROM media_deletion_queue
    `),
  ]);

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
  const mapBySource = new Map<string, MapRow>();
  const inventoryByKey = new Map(inventory.objects.map(object => [object.fileName, object]));
  maps.forEach(row => {
    const sourceKey = keyFromUrl(row.source_url);
    const canonicalKey = keyFromUrl(row.stored_url);
    mapBySource.set(sourceKey, row);
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
  statuses.forEach(row => {
    add(keyFromUrl(row.url), { kind: 'worker', label: `worker status${row.media_id ? ` for ${row.media_id}` : ''}`, mediaId: row.media_id || undefined, title: row.title || undefined });
    if (row.source_url) add(keyFromUrl(row.source_url), { kind: 'worker', label: 'worker source status', mediaId: row.media_id || undefined, title: row.title || undefined });
  });
  hints.forEach(row => add(keyFromUrl(row.url), { kind: 'hint', label: 'upload registration hint', title: row.title || row.original_file_name || undefined }));
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
  deletions.forEach(row => {
    const relation = { kind: 'deletion' as const, label: `deletion queue${row.media_id ? ` for ${row.media_id}` : ''}`, mediaId: row.media_id || undefined, title: row.title || undefined };
    addJsonKeys(row.urls, relation);
    addJsonKeys(row.prefixes, relation, true);
  });

  const items = inventory.objects.map((object: StorageListItem): StorageCleanupItem => {
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
    const canonical = canonicalKey ? inventoryByKey.get(canonicalKey) : undefined;
    const activeMedia = map?.media_id ? mediaById.get(map.media_id) : undefined;
    const isSourceCleanup = Boolean(
      map && canonical && canonicalKey !== key &&
      activeMedia?.url === map.stored_url &&
      itemRelations.every(relation => relation.kind === 'source' || relation.kind === 'title') &&
      object.sizeBytes !== undefined && canonical.sizeBytes !== undefined &&
      object.sizeBytes === canonical.sizeBytes,
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
      canDelete: classification === 'source-cleanup',
      reason: isSourceCleanup
        ? `Verified source replacement ${canonicalKey} exists with the same byte size.`
        : itemRelations.length > 0
          ? 'Linked to database or registration data; deletion is blocked.'
          : generated
            ? 'Generated artifact has no current media reference.'
            : 'No database or registration relationship was found.'
    };
  }).sort((a, b) => Number(b.canDelete) - Number(a.canDelete) || a.key.localeCompare(b.key));

  return {
    checkedAt: new Date().toISOString(),
    provider: inventory.provider,
    totalObjects: inventory.objects.length,
    items,
    errors: [],
    nextCursor: inventory.nextContinuationToken,
    scannedObjects: inventory.objects.length,
  };
};

export const getStorageCleanupSnapshot = async (cursor?: string) =>
  runAuthenticatedAdminServerAction(() => buildSnapshot('', cursor), 'manage-configuration');

export const deleteStorageCleanupItem = async (key: string) =>
  runAuthenticatedAdminServerAction(async () => {
    const snapshot = await buildSnapshot(key);
    const item = snapshot.items.find(candidate => candidate.key === key);
    if (!item || !item.canDelete) {
      throw new Error('This object is linked or could not be safely verified.');
    }
    await deleteFile(item.url);
    return { deleted: key };
  }, 'manage-configuration');

export const deleteStorageCleanupItems = async (keys: string[]) =>
  runAuthenticatedAdminServerAction(async () => {
    const uniqueKeys = Array.from(new Set(keys)).slice(0, 50);
    const deleted: string[] = [];
    const skipped: string[] = [];
    for (const key of uniqueKeys) {
      const snapshot = await buildSnapshot(key);
      const item = snapshot.items.find(candidate => candidate.key === key);
      if (!item || !item.canDelete) {
        skipped.push(key);
        continue;
      }
      await deleteFile(item.url);
      deleted.push(key);
    }
    return { deleted, skipped };
  }, 'manage-configuration');
