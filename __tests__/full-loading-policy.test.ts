import {
  FULL_IMAGE_LOAD_AHEAD_VIEWPORTS,
  FULL_LIST_LOAD_AHEAD_VIEWPORTS,
  INFINITE_SCROLL_FULL_INITIAL,
  INFINITE_SCROLL_FULL_MULTIPLE,
} from '@/media/loading-policy';

describe('full page loading policy', () => {
  it('starts with a small payload and appends compact batches', () => {
    expect(INFINITE_SCROLL_FULL_INITIAL).toBe(4);
    expect(INFINITE_SCROLL_FULL_MULTIPLE).toBe(6);
  });

  it('loads the next batch and images shortly before they are needed', () => {
    expect(FULL_LIST_LOAD_AHEAD_VIEWPORTS).toBe(1.5);
    expect(FULL_IMAGE_LOAD_AHEAD_VIEWPORTS).toBe(2);
  });
});
