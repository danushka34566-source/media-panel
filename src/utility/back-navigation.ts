function browserNavigation() {
  return (window as Window & {
    navigation?: {
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

export function currentHistoryKey(): string | undefined {
  return browserNavigation()?.currentEntry?.key || history.state?.[entryKey];
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
  history.pushState = (state, title, url) => push({
    ...state,
    [previousUrlKey]: location.href,
    [previousEntryKey]: history.state?.[entryKey],
    [entryKey]: newEntryKey(),
  }, title, url);
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
    previous.pathname === fallback.pathname &&
    ((!fallback.search && matchPath !== 'exact') || previous.search === fallback.search) &&
    ((!fallback.hash && matchPath !== 'exact') || previous.hash === fallback.hash)
  ))) {
    router.back();
  } else {
    router.replace(fallbackHref);
  }
}
