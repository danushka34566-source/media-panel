import {
  getCanonicalAdminMediaPath,
  getMediaSearchQuery,
  isPathMedia,
  pathForSearch,
  PATH_ROOT,
} from '@/app/path';

function browserNavigation() {
  return (window as Window & {
    navigation?: EventTarget & {
      currentEntry: Pick<NavigationHistoryEntry, 'index' | 'key'> | null
      entries(): Pick<NavigationHistoryEntry, 'url'>[]
    }
  }).navigation;
}

type Router = {
  back(): void
  replace(href: string): void
};

// On browsers without the Navigation API, keep the source URL on the entry
// itself. Back, Forward, reload and branching then follow the browser stack.
const previousUrlKey = 'mediaPanelPreviousUrl';
const previousEntryKey = 'mediaPanelPreviousEntryKey';
const entryKey = 'mediaPanelEntryKey';
const replacedUrlPrefix = 'media-panel:history-replaced:';
const legacyEntryChangeEvent = 'media-panel:history-entry-change';
let hasInitializedLegacyHistory = false;

export function currentHistoryKey(): string | undefined {
  return browserNavigation()?.currentEntry?.key || history.state?.[entryKey];
}

export function ensureLegacyHistoryTracking() {
  if (hasInitializedLegacyHistory || browserNavigation()) { return; }
  trackLegacyHistory();
  hasInitializedLegacyHistory = true;
}

export function subscribeToHistoryEntryChanges(onChange: () => void) {
  const navigation = browserNavigation();
  let subscribed = true;
  const notify = () => {
    // Next updates history from an insertion effect. Let that commit settle
    // before a subscriber schedules a React update for the new entry.
    queueMicrotask(() => { if (subscribed) { onChange(); } });
  };

  if (navigation) {
    navigation.addEventListener('currententrychange', notify);
  } else {
    window.addEventListener(legacyEntryChangeEvent, notify);
    window.addEventListener('popstate', notify);
  }

  return () => {
    subscribed = false;
    if (navigation) {
      navigation.removeEventListener('currententrychange', notify);
    } else {
      window.removeEventListener(legacyEntryChangeEvent, notify);
      window.removeEventListener('popstate', notify);
    }
  };
}

export function trackLegacyHistory() {
  if (browserNavigation()) { return; }
  const history = window.history;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  const newEntryKey = () => Math.random().toString(36).slice(2);
  if (!history.state?.[entryKey]) {
    replace({ ...history.state, [entryKey]: newEntryKey() }, '');
  }
  history.pushState = (state, title, url) => {
    push({
      ...state,
      [previousUrlKey]: location.href,
      [previousEntryKey]: history.state?.[entryKey],
      [entryKey]: newEntryKey(),
    }, title, url);
    window.dispatchEvent(new Event(legacyEntryChangeEvent));
  };
  history.replaceState = (state, title, url) => {
    const before = location.href;
    const key = history.state?.[entryKey] ?? newEntryKey();
    replace({
      ...state,
      [previousUrlKey]: history.state?.[previousUrlKey],
      [previousEntryKey]: history.state?.[previousEntryKey],
      [entryKey]: key,
    }, title, url);
    if (location.href !== before) {
      try { sessionStorage.setItem(replacedUrlPrefix + key, location.href); } catch {}
      window.dispatchEvent(new Event(legacyEntryChangeEvent));
    }
  };
}

function legacyPreviousUrl() {
  const state = history.state;
  if (state?.[previousEntryKey]) {
    try {
      const replacedUrl = sessionStorage.getItem(replacedUrlPrefix + state[previousEntryKey]);
      if (replacedUrl) { return replacedUrl; }
    } catch {}
  }
  return state?.[previousUrlKey];
}

export function resolveBackFallbackHref(
  fallbackHref: string,
  pathname: string,
  queryParam: string | null,
  matchPath: boolean | 'exact' = false,
) {
  if (matchPath || fallbackHref !== PATH_ROOT || !isPathMedia(pathname)) {
    return fallbackHref;
  }
  const query = getMediaSearchQuery(queryParam ?? undefined);
  return query ? pathForSearch(query) : fallbackHref;
}

export function goBackOrReplace(
  router: Router, fallbackHref: string, matchPath: boolean | 'exact' = false,
) {
  const navigation = browserNavigation();
  const previousUrl = navigation
    ? navigation.entries()[(navigation.currentEntry?.index ?? 0) - 1]?.url
    : legacyPreviousUrl();
  const previous = previousUrl ? new URL(previousUrl, location.href) : undefined;
  const fallback = new URL(fallbackHref, location.href);
  if (previous?.origin === location.origin && (!matchPath || (
    getCanonicalAdminMediaPath(previous.pathname) ===
      getCanonicalAdminMediaPath(fallback.pathname) &&
    ((!fallback.search && matchPath !== 'exact') || previous.search === fallback.search) &&
    ((!fallback.hash && matchPath !== 'exact') || previous.hash === fallback.hash)
  ))) {
    router.back();
    return;
  }
  router.replace(resolveBackFallbackHref(
    fallbackHref,
    location.pathname,
    new URLSearchParams(location.search).get('query'),
    matchPath,
  ));
}
