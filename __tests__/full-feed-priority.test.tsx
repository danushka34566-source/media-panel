import { render, screen } from '@testing-library/react';
import type { Media } from '@/media';
import MediaFullPage from '@/media/MediaFullPage';
import { INFINITE_SCROLL_FULL_INITIAL } from '@/media/loading-policy';

jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));
jest.mock('../src/media/useMediaScrollRestoration', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/components/AnimateItems', () => ({
  __esModule: true,
  default: ({ items }: { items: React.ReactNode[] }) => <>{items}</>,
}));
jest.mock('../src/media/MediaLarge', () => ({
  __esModule: true,
  default: ({ photo, priority, initiallyLoadPreviewImage }: {
    photo: Media
    priority: boolean
    initiallyLoadPreviewImage: boolean
  }) => <div
    data-testid={photo.id}
    data-priority={priority}
    data-eager-poster={initiallyLoadPreviewImage}
  />,
}));
jest.mock('../src/media/InfiniteMediaScroll', () => ({
  __esModule: true,
  default: function InfiniteMediaScroll({ children, initialOffset }: {
    children: (page: { key: string, photos: Media[] }) => React.ReactNode
    initialOffset: number
  }) {
    return <div data-testid="infinite-feed" data-offset={initialOffset}>
      {children({ key: 'next-page', photos: [{ id: 'subsequent' } as Media] })}
    </div>;
  },
}));

it('only gives the initial full-feed media eager startup priority', () => {
  const photos = ['first', 'second', 'third'].map(id => ({ id }) as Media);
  render(<MediaFullPage
    photos={photos}
    photosCount={4}
    sortBy="takenAt"
    sortWithPriority={false}
  />);

  expect(screen.getByTestId('first').dataset.priority).toBe('true');
  expect(screen.getByTestId('second').dataset.eagerPoster).toBe('true');
  expect(screen.getByTestId('third').dataset.eagerPoster).toBe('false');
  expect(screen.getByTestId('subsequent').dataset.priority).toBe('false');
  expect(screen.getByTestId('subsequent').dataset.eagerPoster).toBe('false');
});

it('starts the next page after the raw batch when initial rows were filtered', () => {
  const photos = [{ id: 'first' } as Media];
  render(<MediaFullPage
    photos={photos}
    photosCount={2}
    sortBy="takenAt"
    sortWithPriority={false}
  />);

  expect(screen.getByTestId('infinite-feed').dataset.offset)
    .toBe(String(INFINITE_SCROLL_FULL_INITIAL));
});
