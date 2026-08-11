import { isImageLoaded } from '@/components/image/image-loading';

describe('image loading state', () => {
  it('recognizes an image that completed before its load handler attached', () => {
    expect(isImageLoaded({ complete: true, naturalWidth: 1200 })).toBe(true);
  });

  it('keeps the fallback for incomplete and failed images', () => {
    expect(isImageLoaded({ complete: false, naturalWidth: 0 })).toBe(false);
    expect(isImageLoaded({ complete: true, naturalWidth: 0 })).toBe(false);
  });
});
