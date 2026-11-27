import { currentHistoryKey, goBackOrReplace, trackLegacyHistory } from '@/utility/back-navigation';
import { fireEvent, render } from '@testing-library/react';
import MediaEscapeHandler from '@/media/MediaEscapeHandler';
import BackLink from '@/components/BackLink';
import { createElement } from 'react';

jest.mock('next/navigation', () => ({
  usePathname: () => location.pathname,
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(location.search),
}));
jest.mock('next/link', () => function Link({ children, href, onNavigate }: {
  children: React.ReactNode
  href: string
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  return createElement('a', {
    href,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!event.ctrlKey && !event.metaKey) { onNavigate(event); }
    },
  }, children);
});
jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));
jest.mock('../src/app/AppState', () => ({
  useAppState: () => ({ shouldRespondToKeyboardCommands: true }),
}));

const router = { back: jest.fn(), replace: jest.fn() };
const origin = window.location.origin;
const nativeNavigation = Object.getOwnPropertyDescriptor(window, 'navigation');

afterEach(() => {
  jest.clearAllMocks();
  if (nativeNavigation) { Object.defineProperty(window, 'navigation', nativeNavigation); }
  else { Reflect.deleteProperty(window, 'navigation'); }
});

function setPrevious(url?: string) {
  Object.defineProperty(window, 'navigation', { configurable: true, value: {
    currentEntry: { index: url ? 1 : 0 },
    entries: () => url ? [{ url }, { url: location.href }] : [{ url: location.href }],
  } });
}

it('returns to the actual previous entry including its filters and page', () => {
  setPrevious(origin + '/admin/media?page=4#library');
  goBackOrReplace(router, '/admin/media', true);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});

it('returns to a previous library page on the legacy URL', () => {
  setPrevious(origin + '/admin/photos?page=4');
  goBackOrReplace(router, '/admin/media', true);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});

it.each([undefined, 'https://example.org/page'])('uses the local parent on direct or external entry', url => {
  setPrevious(url);
  goBackOrReplace(router, '/album/trip');
  expect(router.replace).toHaveBeenCalledWith('/album/trip');
});

it.each(['header link', 'Escape'])('opens the search from a direct detail via %s', control => {
  setPrevious();
  const initialUrl = location.href;
  history.replaceState(null, '', '/UsKSGcbt?sort=takenAt&query=+rain+%26+shine+&query=ignored');
  try {
    if (control === 'Escape') {
      render(createElement(MediaEscapeHandler));
      fireEvent.keyDown(window, { key: 'Escape' });
    } else {
      const view = render(createElement(BackLink, { href: '/' }, 'Go back'));
      fireEvent.click(view.getByRole('link', { name: 'Go back' }));
    }
    expect(router.replace).toHaveBeenCalledWith('/search?query=rain+%26+shine');
    expect(router.back).not.toHaveBeenCalled();
  } finally {
    history.replaceState(null, '', initialUrl);
  }
});

it('provides the search link for native back-link actions', () => {
  setPrevious();
  const initialUrl = location.href;
  history.replaceState(null, '', '/UsKSGcbt?sort=takenAt&query=rain+%26+shine');
  try {
    const view = render(createElement(BackLink, { href: '/' }, 'Go back'));
    const link = view.getByRole('link', { name: 'Go back' });

    expect(link.getAttribute('href')).toBe('/search?query=rain+%26+shine');
    expect(fireEvent.contextMenu(link)).toBe(true);
    link.setAttribute('target', '_blank');
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  } finally {
    history.replaceState(null, '', initialUrl);
  }
});

it('returns to the previous entry from a search detail when one exists', () => {
  setPrevious(origin + '/previous');
  const initialUrl = location.href;
  history.replaceState(null, '', '/UsKSGcbt?query=rain');
  try {
    goBackOrReplace(router, '/');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  } finally {
    history.replaceState(null, '', initialUrl);
  }
});

it('keeps an explicitly labelled return destination', () => {
  setPrevious(origin + '/admin/users?page=2');
  goBackOrReplace(router, '/admin/users?page=3', true);
  expect(router.replace).toHaveBeenCalledWith('/admin/users?page=3');
});

it('returns to the user list when the prior entry is another editor', () => {
  setPrevious(origin + '/admin/users?user=123');
  goBackOrReplace(router, '/admin/users', 'exact');
  expect(router.replace).toHaveBeenCalledWith('/admin/users');
});

it('retains legacy entry identity across replace and records the source of pushes', () => {
  const { pushState, replaceState, state } = history;
  const initialUrl = location.href;
  try {
    trackLegacyHistory();
    history.replaceState({ framework: 'current' }, '', '/search?query=trip');
    const sourceKey = currentHistoryKey();
    history.pushState({ framework: 'next' }, '', '/photo');
    const detailKey = currentHistoryKey();
    expect(detailKey).not.toBe(sourceKey);
    history.replaceState({ framework: 'updated' }, '', '/photo');
    expect(currentHistoryKey()).toBe(detailKey);
    expect(history.state.framework).toBe('updated');
    goBackOrReplace(router, '/search', true);
    expect(router.back).toHaveBeenCalledTimes(1);
  } finally {
    history.pushState = pushState;
    history.replaceState = replaceState;
    history.replaceState(state, '', initialUrl);
  }
});

it('initializes history tracking when the persistent navigation mounts', () => {
  Reflect.deleteProperty(window, 'navigation');
  const { pushState, replaceState, state } = history;
  const initialUrl = location.href;
  try {
    history.replaceState({ __NA: true }, '', '/search?query=summer');
    const { rerender } = render(createElement(MediaEscapeHandler));
    const sourceKey = currentHistoryKey();
    expect(sourceKey).toBeTruthy();

    history.pushState({ __NA: true }, '', '/album/trips/first');
    expect(currentHistoryKey()).not.toBe(sourceKey);
    expect(history.state.__NA).toBe(true);
    rerender(createElement(MediaEscapeHandler));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(router.back).toHaveBeenCalledTimes(1);
  } finally {
    history.pushState = pushState;
    history.replaceState = replaceState;
    history.replaceState(state, '', initialUrl);
  }
});

it('traverses two detail pages back to search and forward in order', async () => {
  const { pushState, replaceState, state } = history;
  const initialUrl = location.href;
  const traversed = () => new Promise<void>(resolve =>
    window.addEventListener('popstate', () => resolve(), { once: true }));
  const browserRouter = { back: () => history.back(), replace: router.replace };
  try {
    trackLegacyHistory();
    history.replaceState(null, '', '/search?query=summer');
    history.pushState(null, '', '/album/trips/first');
    history.pushState(null, '', '/album/trips/second');
    for (const expected of ['/album/trips/first', '/search?query=summer']) {
      const finished = traversed();
      goBackOrReplace(browserRouter, '/album/trips');
      await finished;
      expect(location.pathname + location.search).toBe(expected);
    }
    for (const expected of ['/album/trips/first', '/album/trips/second']) {
      const finished = traversed();
      history.forward();
      await finished;
      expect(location.pathname).toBe(expected);
    }
  } finally {
    history.pushState = pushState;
    history.replaceState = replaceState;
    history.replaceState(state, '', initialUrl);
  }
});

it('recognizes a replaced previous entry after traversing forward', async () => {
  const { pushState, replaceState, state } = history;
  const initialUrl = location.href;
  const traversed = () => new Promise<void>(resolve =>
    window.addEventListener('popstate', () => resolve(), { once: true }));
  try {
    trackLegacyHistory();
    history.replaceState(null, '', '/search');
    history.pushState(null, '', '/photo');
    let finished = traversed();
    history.back();
    await finished;
    history.replaceState(null, '', '/grid');
    finished = traversed();
    history.forward();
    await finished;
    goBackOrReplace(router, '/grid', true);
    expect(router.back).toHaveBeenCalledTimes(1);
  } finally {
    history.pushState = pushState;
    history.replaceState = replaceState;
    history.replaceState(state, '', initialUrl);
  }
});
