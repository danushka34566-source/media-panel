'use client';

import { useMemo, useState, useTransition } from 'react';
import { FiCheckCircle, FiDatabase, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { formatBytes } from '@/utility/number';
import {
  deleteStorageCleanupItem,
  deleteStorageCleanupItems,
  getStorageCleanupSnapshot,
  type StorageCleanupItem,
  type StorageCleanupSnapshot,
} from './actions';

export default function StorageCleanupClient({ initial }: { initial: StorageCleanupSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [filter, setFilter] = useState('');
  const [showLinked, setShowLinked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const visible = useMemo(() => snapshot.items.filter(item =>
    (showLinked || item.canDelete) &&
    (!filter || `${item.key} ${item.relations.map(relation => `${relation.label} ${relation.title || ''}`).join(' ')}`
      .toLocaleLowerCase().includes(filter.toLocaleLowerCase())),
  ), [filter, showLinked, snapshot.items]);
  const candidates = visible.filter(item => item.canDelete);

  const refresh = () => startTransition(async () => {
    setSnapshot(await getStorageCleanupSnapshot());
  });
  const loadMore = () => startTransition(async () => {
    if (!snapshot.nextCursor) return;
    const next = await getStorageCleanupSnapshot(snapshot.nextCursor);
    setSnapshot(current => ({
      ...next,
      items: [...current.items, ...next.items],
      scannedObjects: current.scannedObjects + next.scannedObjects,
    }));
  });
  const remove = (item: StorageCleanupItem) => {
    if (!window.confirm(`Delete ${item.key}? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteStorageCleanupItem(item.key);
      setSnapshot(await getStorageCleanupSnapshot());
    });
  };
  const removeAll = () => {
    if (!window.confirm(`Delete ${candidates.length} verified cleanup candidates?`)) return;
    startTransition(async () => {
      await deleteStorageCleanupItems(candidates.map(item => item.key));
      setSnapshot(await getStorageCleanupSnapshot());
    });
  };

  return <div className="space-y-5" id="storage-cleanup">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-medium">Storage cleanup</h1>
        <p className="mt-1 text-sm text-dim">
          Reconciles every storage object with media, registration, worker, hint, and deletion records.
        </p>
      </div>
      <button type="button" onClick={refresh} disabled={isPending} className="inline-flex items-center gap-2 rounded-md border border-dim px-3 py-2 text-sm hover:text-main disabled:opacity-50">
        <FiRefreshCw className={isPending ? 'animate-spin' : undefined} size={15} /> Refresh audit
      </button>
    </div>
    <div className="grid gap-2 text-sm sm:grid-cols-3">
      <div className="rounded-md border border-dim p-3"><div className="text-dim">Scanned objects</div><div className="mt-1 text-lg">{snapshot.scannedObjects}</div></div>
      <div className="rounded-md border border-dim p-3"><div className="text-dim">Cleanup candidates</div><div className="mt-1 text-lg">{snapshot.items.filter(item => item.canDelete).length}</div></div>
      <div className="rounded-md border border-dim p-3"><div className="text-dim">Last audit</div><div className="mt-1">{new Date(snapshot.checkedAt).toLocaleString()}</div></div>
    </div>
    <div className="flex flex-wrap gap-2">
      <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search filename, title, ID, or relation" className="min-w-[260px] grow rounded-md border border-dim bg-transparent px-3 py-2 text-sm outline-none focus:border-main" />
      <button type="button" onClick={() => setShowLinked(value => !value)} className="rounded-md border border-dim px-3 py-2 text-sm hover:text-main">
        {showLinked ? 'Hide linked files' : 'Show all files'}
      </button>
      <button type="button" onClick={removeAll} disabled={isPending || candidates.length === 0} className="inline-flex items-center gap-2 rounded-md border border-red-400/60 px-3 py-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50">
        <FiTrash2 size={15} /> Delete verified candidates
      </button>
    </div>
    <div className="space-y-2">
      {visible.map(item => <div key={item.key} className="rounded-md border border-dim p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="break-all font-medium">{item.key}</div>
            <div className="mt-1 text-dim">
              {item.sizeBytes === undefined ? 'size unknown' : formatBytes(item.sizeBytes)}
              {item.uploadedAt ? ` · ${new Date(item.uploadedAt).toLocaleString()}` : ''}
            </div>
          </div>
          {item.canDelete
            ? <button type="button" onClick={() => remove(item)} disabled={isPending} className="inline-flex shrink-0 items-center gap-1 rounded border border-red-400/60 px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-50"><FiTrash2 size={14} /> Delete</button>
            : <FiCheckCircle className="shrink-0 text-green-400" size={17} />}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.relations.length > 0 ? item.relations.map((relation, index) => <span key={`${relation.label}-${index}`} className="rounded bg-dim/10 px-2 py-1 text-xs text-dim">{relation.label}{relation.title ? ` · ${relation.title}` : ''}</span>) : <span className="text-amber-500">No database relationship found</span>}
        </div>
        <div className="mt-2 text-xs text-dim">{item.reason}{item.canonicalSizeBytes !== undefined ? ` Canonical size: ${formatBytes(item.canonicalSizeBytes)}.` : ''}</div>
      </div>)}
      {visible.length === 0 && <div className="rounded-md border border-dim p-6 text-center text-sm text-dim">No matching storage objects.</div>}
    </div>
    {snapshot.nextCursor && <button type="button" onClick={loadMore} disabled={isPending} className="w-full rounded-md border border-dim px-3 py-2 text-sm hover:text-main disabled:opacity-50">Load next storage page</button>}
    <div className="flex items-center gap-2 text-xs text-dim"><FiDatabase size={14} /> Audit is read-only until an explicit delete action is confirmed.</div>
  </div>;
}
