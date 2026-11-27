import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import AppViewSwitcher, { type SwitcherSelection } from '@/app/AppViewSwitcher';
import useStickyNav from '@/app/useStickyNav';

const mockNavigate = jest.fn();
const mockSetIsCommandKOpen = jest.fn();
const mockSetIsWideGrid = jest.fn();
let mockPathname = '/search';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({}),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: function Link({
    children, href, ref, 'aria-label': label,
  }: ComponentProps<'a'>) {
    return <a
      href={href}
      ref={ref}
      aria-label={label}
      onClick={event => {
        event.preventDefault();
        mockNavigate(href);
      }}
    >
      {children}
    </a>;
  },
  useLinkStatus: () => ({ pending: false }),
}));
jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));
jest.mock('../src/app/AppState', () => ({
  useAppState: () => ({
    shouldRespondToKeyboardCommands: true,
    setIsCommandKOpen: mockSetIsCommandKOpen,
    setIsWideGrid: mockSetIsWideGrid,
  }),
}));
jest.mock('../src/app/config', () => ({
  getBaseUrl: () => 'https://media.example',
  GRID_HOMEPAGE_ENABLED: false,
  NAV_SORT_CONTROL: 'toggle',
  SHOW_KEYBOARD_SHORTCUT_TOOLTIPS: false,
  USER_DEFAULT_SORT_BY: 'takenAt',
  USER_DEFAULT_SORT_WITH_PRIORITY: false,
}));
jest.mock('../src/admin/AdminAppMenu', () => () => null);
jest.mock('../src/media/sort/SortMenu', () => () => null);
jest.mock('../src/auth/actions', () => ({
  setMediaSortPreferenceAction: jest.fn(),
}));
jest.mock('../src/utility/useScrollDirection', () => () => ({
  scrollDirection: 'down',
  scrollY: 240,
}));

function renderSwitcher(currentSelection?: SwitcherSelection) {
  return render(<AppViewSwitcher
    currentSelection={currentSelection}
    animate={false}
    isAdminMenuOpen={false}
    setIsAdminMenuOpen={jest.fn()}
  />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/search';
});

it('labels the gallery links and provides a focusable Search button', () => {
  renderSwitcher();

  expect(screen.getByRole('link', { name: 'Full' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Grid' })).toBeTruthy();
  const search = screen.getByRole('button', { name: 'Search' });
  act(() => { search.focus(); });
  expect(document.activeElement).toBe(search);
  fireEvent.click(search);
  expect(mockSetIsCommandKOpen).toHaveBeenCalledWith(true);
  expect(document.activeElement).toBe(search);
});

it('keeps browser Find shortcuts available without switching views', () => {
  renderSwitcher();

  fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'g', ctrlKey: true });
  expect(mockNavigate).not.toHaveBeenCalled();

  fireEvent.keyDown(window, { key: 'f' });
  fireEvent.keyDown(window, { key: 'g' });
  expect(mockNavigate).toHaveBeenCalledTimes(2);
});

it('gives the active grid control a focusable button role', () => {
  renderSwitcher('grid');

  const grid = screen.getByRole('button', { name: 'Grid' });
  act(() => { grid.focus(); });
  expect(document.activeElement).toBe(grid);
  fireEvent.keyDown(window, { key: 'g', ctrlKey: true });
  expect(mockSetIsWideGrid).not.toHaveBeenCalled();
});

it('keeps unavailable sort controls inert on routes without sorting', () => {
  const { container, unmount } = renderSwitcher();
  const hiddenSort = container.querySelector('a[aria-label^="View "]');
  expect(hiddenSort?.closest('[inert]')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /view (newest|oldest)/i })).toBeNull();

  unmount();
  mockPathname = '/full';
  renderSwitcher('full');
  const sort = screen.getByRole('link', { name: /view (newest|oldest)/i });
  expect(sort.closest('[inert]')).toBeNull();
});

it('reveals the hidden sticky navigation when a control receives focus', () => {
  const nav = document.createElement('nav');
  const { result } = renderHook(() => useStickyNav({ current: nav }));
  const classes = result.current.classNameStickyNav.split(' ');

  expect(classes).toContain('translate-y-[-100%]');
  expect(classes).toContain('focus-within:translate-y-0');
});
