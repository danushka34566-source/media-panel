'use client';

export type DockedVideoState = {
  mediaId: string
  title?: string
  detailPath: string
  sourceUrl: string
  fallbackUrl?: string
  posterUrl?: string
  currentTime: number
  wasPlaying: boolean
  muted: boolean
};

type Listener = () => void;

const EMPTY_DOCKED_VIDEO: DockedVideoState | undefined = undefined;

let dockedVideo: DockedVideoState | undefined;
let detailVideoPageActive = false;
const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach(listener => listener());
};

export const subscribeVideoMiniPlayer = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getDockedVideo = () => dockedVideo;

// A stable server snapshot keeps useSyncExternalStore from re-rendering in a
// loop during SSR/hydration. The browser snapshot is the store value above.
export const getDockedVideoServerSnapshot = () => EMPTY_DOCKED_VIDEO;

export const setDockedVideo = (next: DockedVideoState) => {
  dockedVideo = next;
  notify();
};

export const updateDockedVideo = (
  patch: Partial<DockedVideoState>,
  notifyListeners = false,
) => {
  if (!dockedVideo) { return; }
  dockedVideo = { ...dockedVideo, ...patch };
  if (notifyListeners) { notify(); }
};

export const clearDockedVideo = () => {
  if (!dockedVideo) { return; }
  dockedVideo = undefined;
  notify();
};

export const setDetailVideoPageActive = (active: boolean) => {
  if (detailVideoPageActive === active) { return; }
  detailVideoPageActive = active;
  notify();
};

export const isDetailVideoPageActive = () => detailVideoPageActive;
