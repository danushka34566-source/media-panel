'use client';

import { useMemo, useState, useTransition } from 'react';
import { FiCheckCircle, FiDatabase, FiRefreshCw } from 'react-icons/fi';
import { formatBytes } from '@/utility/number';
import {
  getStorageCleanupSnapshot,
  type StorageCleanupSnapshot,
} from './actions';

export default function StorageCleanupClient({
  initial,
}: { initial?: StorageCleanupSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | undefined>(
    initial ? undefined : 'Unable to load the storage audit. Try refreshing the audit.',
  );
  const [isPending, startTransition] = useTransition();
  const search = filter.trim().toLocaleLowerCase();
  const visible = useMemo(() => (snapshot?.items ?? []).filter(item =>
    (showAll || item.classification === 'source-cleanup') &&
    (!search || [item.key, ...item.relations.flatMap(relation => [
      relation.label,
      relation.title,
      relation.mediaId,
    ])].join(' ').toLocaleLowerCase().includes(search)),
  ), [search, showAll, snapshot]);

  const runAuditAction = (action: () => Promise<void>, errorMessage: string) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError(errorMessage);
      }
    });
  };
  const refresh = () => runAuditAction(async () => {
    setSnapshot(await getStorageCleanupSnapshot());
  }, 'Unable to refresh the storage audit. Try again.');
  const loadMore = () => runAuditAction(async () => {
    if (!snapshot?.nextCursor) return;
    const next = await getStorageCleanupSnapshot(snapshot.nextCursor);
    setSnapshot(current => current ? ({
      ...next,
      items: [...current.items, ...next.items],
      scannedObjects: current.scannedObjects + next.scannedObjects,
      errors: [...new Set([...current.errors, ...next.errors])],
    }) : next);
  }, 'Unable to load the next storage page. Try again.');

  const header =
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
    </div>;
  const errorNote = error && <p role="alert" className="text-sm text-error">{error}</p>;

  if (!snapshot) {
    return <div className="space-y-5" id="storage-cleanup">
      {header}
      {errorNote}
    </div>;
  }

  return <div className="space-y-5" id="storage-cleanup">
    {header}
    <p className="flex items-center gap-2 text-sm text-dim">
      <FiDatabase size={15} className="shrink-0" />
      {snapshot.deletionUnavailableReason}
    </p>
    <div className="grid gap-2 text-sm sm:grid-cols-3">
      <div className="rounded-md border border-dim p-3"><div className="text-dim">Scanned objects</div><div className="mt-1 text-lg">{snapshot.scannedObjects}</div></div>
      <div className="rounded-md border border-dim p-3"><div className="text-dim">Cleanup candidates</div><div className="mt-1 text-lg">{snapshot.items.filter(item => item.classification === 'source-cleanup').length}</div></div>
      <div className="rounded-md border border-dim p-3"><div className="text-dim">Last audit</div><div className="mt-1">{new Date(snapshot.checkedAt).toLocaleString()}</div></div>
    </div>
    <div className="flex flex-wrap gap-2">
      <input
        type="search"
        aria-label="Search storage objects"
        value={filter}
        onChange={event => setFilter(event.target.value)}
        placeholder="Search filename, title, ID, or relation"
        className="min-w-0 grow basis-64 rounded-md border border-dim bg-transparent px-3 py-2 text-sm outline-none focus:border-main"
      />
      <button type="button" onClick={() => setShowAll(value => !value)} className="rounded-md border border-dim px-3 py-2 text-sm hover:text-main">
        {showAll ? 'Show cleanup candidates only' : 'Show all files'}
      </button>
    </div>
    {errorNote}
    {snapshot.errors.length > 0 && <p role="alert" className="text-sm text-error">
      {snapshot.errors.join(' ')}
    </p>}
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
          {item.classification === 'linked' && <FiCheckCircle
              className="shrink-0 text-green-400"
              size={17}
          />}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.relations.length > 0 ? item.relations.map((relation, index) => <span key={`${relation.label}-${index}`} className="rounded bg-dim/10 px-2 py-1 text-xs text-dim">{relation.label}{relation.title ? ` · ${relation.title}` : ''}</span>) : <span className="text-amber-500">No database relationship found</span>}
        </div>
        <div className="mt-2 text-xs text-dim">{item.reason}{item.canonicalSizeBytes !== undefined ? ` Canonical size: ${formatBytes(item.canonicalSizeBytes)}.` : ''}</div>
      </div>)}
      {visible.length === 0 && <div className="rounded-md border border-dim p-6 text-center text-sm text-dim">No matching storage objects.</div>}
    </div>
    {snapshot.nextCursor && <button type="button" onClick={loadMore} disabled={isPending} className="w-full rounded-md border border-dim px-3 py-2 text-sm hover:text-main disabled:opacity-50">Load next storage page</button>}
  </div>;
}
