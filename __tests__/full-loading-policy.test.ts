import {
  FULL_IMAGE_LOAD_AHEAD_VIEWPORTS,
  FULL_LIST_LOAD_AHEAD_VIEWPORTS,
  INFINITE_SCROLL_FULL_INITIAL,
  INFINITE_SCROLL_FULL_MULTIPLE,
} from '@/media/loading-policy';

describe('full page loading policy', () => {
  it('uses the current full-feed batch sizes outside development', () => {
    expect(INFINITE_SCROLL_FULL_INITIAL).toBe(24);
    expect(INFINITE_SCROLL_FULL_MULTIPLE).toBe(24);
  });

  it('warms the full list and poster images ahead of the viewport', () => {
    expect(FULL_LIST_LOAD_AHEAD_VIEWPORTS).toBe(4);
    expect(FULL_IMAGE_LOAD_AHEAD_VIEWPORTS).toBe(5);
  });
});
