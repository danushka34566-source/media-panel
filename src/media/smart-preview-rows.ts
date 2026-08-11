export type SmartPreviewCard = {
  id: string
  layoutTop: number
}

export const shouldAutoplayGridPreview = (
  mode: 'off' | 'smart' | 'all',
  autoplaySmartPreviews: boolean,
  isSmartPreviewActive: boolean,
) => mode === 'all' || (
  mode === 'smart' &&
  (autoplaySmartPreviews || isSmartPreviewActive)
);

export const shouldPreloadGridPreview = (
  mode: 'off' | 'smart' | 'all',
  autoplaySmartPreviews: boolean,
  supportsHover?: boolean,
) => mode === 'smart' && (
  autoplaySmartPreviews || Boolean(supportsHover)
);

export const shouldSuspendDetailSmartPreviews = (
  videoPreviewMode: 'off' | 'smart' | 'all',
  suspendOnMainPlayback: boolean,
  isMainVideoPlaying: boolean,
) => videoPreviewMode === 'smart' &&
  suspendOnMainPlayback &&
  isMainVideoPlaying;

export const getSmartPreviewIds = (
  cards: SmartPreviewCard[],
  activeId: string,
  includeAdjacentRows: boolean,
) => {
  const rows = new Map<number, string[]>();
  cards.forEach(({ id, layoutTop }) => {
    const row = rows.get(layoutTop) ?? [];
    row.push(id);
    rows.set(layoutTop, row);
  });

  const orderedRows = [...rows.entries()]
    .sort(([topA], [topB]) => topA - topB)
    .map(([, ids]) => ids);
  const activeRowIndex = orderedRows.findIndex(row => row.includes(activeId));
  if (activeRowIndex < 0) { return new Set<string>(); }

  const firstRow = includeAdjacentRows
    ? Math.max(0, activeRowIndex - 1)
    : activeRowIndex;
  const lastRow = includeAdjacentRows
    ? Math.min(orderedRows.length - 1, activeRowIndex + 1)
    : activeRowIndex;

  return new Set(orderedRows.slice(firstRow, lastRow + 1).flat());
};
