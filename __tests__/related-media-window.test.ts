import { getRelatedMediaWindow } from '@/media/related-media-window';

const photos = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));

describe('related media around a detail item', () => {
  it('fills from previous cards when there are too few following cards', () => {
    expect(getRelatedMediaWindow(photos, 'd', 3).map(photo => photo.id))
      .toEqual(['b', 'c', 'e']);
    expect(getRelatedMediaWindow(photos, 'e', 3).map(photo => photo.id))
      .toEqual(['b', 'c', 'd']);
  });

  it('keeps the selected sort order when enough following cards exist', () => {
    expect(getRelatedMediaWindow(photos, 'a', 3).map(photo => photo.id))
      .toEqual(['b', 'c', 'd']);
  });
});
