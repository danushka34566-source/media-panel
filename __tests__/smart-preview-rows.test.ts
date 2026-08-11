import {
  getSmartPreviewIds,
  shouldAutoplayGridPreview,
  shouldPreloadGridPreview,
  shouldSuspendDetailSmartPreviews,
} from '@/media/smart-preview-rows';

const cards = [
  { id: 'a', layoutTop: 0 },
  { id: 'b', layoutTop: 0 },
  { id: 'c', layoutTop: 100 },
  { id: 'd', layoutTop: 100 },
  { id: 'e', layoutTop: 200 },
  { id: 'f', layoutTop: 200 },
  { id: 'g', layoutTop: 300 },
  { id: 'h', layoutTop: 300 },
];

describe('smart preview row selection', () => {
  it('suspends only detail smart previews while the main video plays', () => {
    expect(shouldSuspendDetailSmartPreviews('smart', true, true)).toBe(true);
    expect(shouldSuspendDetailSmartPreviews('all', true, true)).toBe(false);
    expect(shouldSuspendDetailSmartPreviews('smart', false, true)).toBe(false);
    expect(shouldSuspendDetailSmartPreviews('smart', true, false)).toBe(false);
  });
  it('autoplays and preloads detail smart previews without interaction', () => {
    expect(shouldAutoplayGridPreview('smart', true, false)).toBe(true);
    expect(shouldPreloadGridPreview('smart', true, false)).toBe(true);
  });

  it('keeps normal smart grids interaction coordinated', () => {
    expect(shouldAutoplayGridPreview('smart', false, false)).toBe(false);
    expect(shouldAutoplayGridPreview('smart', false, true)).toBe(true);
  });

  it('selects the touched mobile row and both adjacent rows atomically', () => {
    expect([...getSmartPreviewIds(cards, 'd', true)]).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f',
    ]);
  });

  it('selects three rows after moving to another mobile row', () => {
    expect([...getSmartPreviewIds(cards, 'f', true)]).toEqual([
      'c', 'd', 'e', 'f', 'g', 'h',
    ]);
  });

  it('selects only the complete hovered row on desktop', () => {
    expect([...getSmartPreviewIds(cards, 'd', false)]).toEqual(['c', 'd']);
  });

  it('uses stable layout positions regardless of visual transforms', () => {
    const animatedCards = cards.map((card, index) => ({
      ...card,
      visualTop: card.layoutTop + index * 4,
    }));
    expect([...getSmartPreviewIds(animatedCards, 'd', true)]).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f',
    ]);
  });
});
