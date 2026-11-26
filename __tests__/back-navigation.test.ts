import { currentHistoryKey, goBackOrReplace, trackLegacyHistory } from '@/utility/back-navigation';

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

it.each([undefined, 'https://example.org/page'])('uses the local parent on direct or external entry', url => {
  setPrevious(url);
  goBackOrReplace(router, '/album/trip');
  expect(router.replace).toHaveBeenCalledWith('/album/trip');
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
