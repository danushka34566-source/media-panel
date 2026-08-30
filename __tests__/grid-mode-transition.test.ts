import { getGridModeCardTransition } from '@/media/grid-mode-transition';

describe('grid mode card transition', () => {
  it('inverts both position and size into the previous rectangle', () => {
    expect(getGridModeCardTransition(
      { left: 12, top: 100, width: 180, height: 120 },
      { left: 30, top: 84, width: 240, height: 135 },
    )).toEqual({
      x: -18,
      y: 16,
      scaleX: 0.75,
      scaleY: 120 / 135,
      transform: `translate3d(-18px, 16px, 0) scale(0.75, ${120 / 135})`,
    });
  });

  it('skips cards whose visual rectangle is already unchanged', () => {
    expect(getGridModeCardTransition(
      { left: 10, top: 20, width: 200, height: 120 },
      { left: 10.2, top: 19.8, width: 200, height: 120 },
    )).toBeUndefined();
  });

  it('does not animate invalid collapsed layouts', () => {
    expect(getGridModeCardTransition(
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 0, top: 0, width: 0, height: 100 },
    )).toBeUndefined();
  });
});
