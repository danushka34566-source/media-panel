export type DetailNavigationDirection = 'previous' | 'next';

export const DETAIL_NAVIGATION_START_EVENT = 'media-detail-navigation-start';

export const announceDetailNavigationStart = (
  direction: DetailNavigationDirection,
) => {
  window.dispatchEvent(new CustomEvent<DetailNavigationDirection>(
    DETAIL_NAVIGATION_START_EVENT,
    { detail: direction },
  ));
};
