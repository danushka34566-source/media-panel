import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import CommandKClient from '@/cmdk/CommandKClient';
import type { Media } from '@/media';
import { searchMediaAction } from '@/media/actions';

const mockPush = jest.fn();
const mediaResult = {
  id: 'media-123',
  title: 'R&D street-food',
  url: '/media-123.jpg',
  mediaType: 'photo',
  aspectRatio: 1,
  updatedAt: new Date('2025-01-01T00:00:00Z'),
} as Media;

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('camelcase-keys', () => ({
  __esModule: true,
  default: (value: unknown) => value,
}));
jest.mock('../src/app/AppState', () => ({
  useAppState: () => ({ isCommandKOpen: true }),
}));
jest.mock('../src/admin/select/SelectMediaState', () => ({
  useSelectMediaState: () => ({}),
}));
jest.mock('../src/auth/actions', () => ({
  searchUsersCommandAction: jest.fn(),
}));
jest.mock('../src/media/actions', () => ({ searchMediaAction: jest.fn() }));
jest.mock('../src/media/MediaDate', () => () => null);
jest.mock('../src/media/MediaStringEntity', () => ({
  formatMediaStringEntity: (value: string) => value,
}));
jest.mock('../src/components/Modal', () =>
  ({ children }: { children: ReactNode }) => children);

function renderCommandMenu() {
  render(<CommandKClient
    recents={[]}
    years={[]}
    cameras={[]}
    lenses={[]}
    albums={[]}
    tags={[]}
    recipes={[]}
    films={[]}
    focalLengths={[]}
    categories={[]}
    studios={[]}
    performers={[]}
    contentTypes={[]}
  />);

  return screen.getByRole('combobox');
}

const settleDebounce = () => act(async () => {
  jest.advanceTimersByTime(250);
});

const nextAnimationFrame = () => act(async () => {
  jest.advanceTimersToNextFrame();
});

const setUnscrollableSearchList = () => {
  Object.defineProperties(screen.getByRole('listbox'), {
    clientHeight: { value: 120 },
    scrollHeight: { value: 120 },
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
});

afterEach(() => jest.useRealTimers());

it.each(['r&d', 'street-food'])('shows a server match for %s', async query => {
  jest.mocked(searchMediaAction).mockResolvedValue({
    photos: [mediaResult],
    hasMore: false,
  });
  const input = renderCommandMenu();

  fireEvent.change(input, { target: { value: query } });
  await settleDebounce();

  expect(searchMediaAction).toHaveBeenCalledWith(query, 0, 48);
  await act(async () => {
    fireEvent.click(screen.getByText('R&D street-food'));
  });
  const queryString = new URLSearchParams({ query });
  expect(mockPush).toHaveBeenCalledWith(`/media-123?${queryString}`);
});

it('preserves native thumbnail link actions and the search query', async () => {
  jest.mocked(searchMediaAction).mockResolvedValue({
    photos: [mediaResult],
    hasMore: false,
  });
  const input = renderCommandMenu();
  fireEvent.change(input, { target: { value: 'r&d' } });
  await settleDebounce();

  const thumbnail = screen.getByRole('link', { name: 'R&D street-food' });
  const path = '/media-123?query=r%26d';
  expect(thumbnail.getAttribute('href')).toBe(path);
  expect(fireEvent.contextMenu(thumbnail)).toBe(true);

  // Model the separate browsing context used by a modified click.
  thumbnail.setAttribute('target', '_blank');
  expect(fireEvent.click(thumbnail, { ctrlKey: true })).toBe(true);
  expect(fireEvent.click(thumbnail, { metaKey: true })).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
  thumbnail.removeAttribute('target');

  await act(async () => {
    expect(fireEvent.click(thumbnail)).toBe(false);
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith(path);
});

it('blocks Enter on the previous search during debounce', async () => {
  jest.mocked(searchMediaAction).mockResolvedValue({
    photos: [],
    hasMore: false,
  });
  const input = renderCommandMenu();

  fireEvent.change(input, { target: { value: 'rain forest' } });
  await settleDebounce();
  const previousSearch = 'See all results for “rain forest”';
  expect(screen.getByRole('option', { name: previousSearch })).toBeTruthy();

  fireEvent.change(input, { target: { value: 'rain fores' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(screen.queryByRole('option', { name: /see all results/i })).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();

  await settleDebounce();
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });

  expect(mockPush).toHaveBeenCalledWith('/search?query=rain+fores');
});

it('continues past empty raw pages without requiring a scroll', async () => {
  const search = jest.mocked(searchMediaAction);
  search.mockResolvedValueOnce({ photos: [], hasMore: true })
    .mockResolvedValueOnce({ photos: [], hasMore: true })
    .mockResolvedValueOnce({ photos: [mediaResult], hasMore: false });
  const input = renderCommandMenu();
  setUnscrollableSearchList();

  fireEvent.change(input, { target: { value: 'r&d' } });
  await settleDebounce();
  await nextAnimationFrame();
  await nextAnimationFrame();
  await nextAnimationFrame();

  expect(search.mock.calls).toEqual([
    ['r&d', 0, 48],
    ['r&d', 48, 48],
    ['r&d', 96, 48],
  ]);
  expect(screen.getByText('R&D street-food')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Load More' })).toBeNull();
});

it('bounds automatic requests and keeps the next raw page reachable', async () => {
  const search = jest.mocked(searchMediaAction);
  search.mockResolvedValue({ photos: [], hasMore: true });
  const input = renderCommandMenu();
  setUnscrollableSearchList();

  fireEvent.change(input, { target: { value: 'r&d' } });
  await settleDebounce();
  for (let frame = 0; frame < 5; frame += 1) {
    await nextAnimationFrame();
  }

  expect(search.mock.calls).toEqual([
    ['r&d', 0, 48],
    ['r&d', 48, 48],
    ['r&d', 96, 48],
    ['r&d', 144, 48],
  ]);

  search.mockResolvedValueOnce({ photos: [mediaResult], hasMore: false });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
  });
  expect(search).toHaveBeenLastCalledWith('r&d', 192, 48);
  expect(screen.getByText('R&D street-food')).toBeTruthy();
});
