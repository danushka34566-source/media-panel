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
  pendingHandoff?: boolean
};

export const DETAIL_VIDEO_MINIMIZE_EVENT = 'media-detail-video-minimize';
export const DETAIL_VIDEO_RESTORE_EVENT = 'media-detail-video-restore';
export const PERSISTENT_VIDEO_FULLSCREEN_EVENT =
  'persistent-video-fullscreen';
export const PERSISTENT_VIDEO_PIP_EVENT = 'persistent-video-picture-in-picture';
export const PERSISTENT_VIDEO_HANDOFF_READY_EVENT =
  'persistent-video-handoff-ready';

export const requestDetailVideoMinimize = (mediaId: string) => {
  window.dispatchEvent(new CustomEvent(DETAIL_VIDEO_MINIMIZE_EVENT, {
    detail: { mediaId },
  }));
};

export const requestDetailVideoRestore = (mediaId: string) => {
  window.dispatchEvent(new CustomEvent(DETAIL_VIDEO_RESTORE_EVENT, {
    detail: { mediaId },
  }));
};

export const requestPersistentVideoFullscreen = (mediaId: string) => {
  window.dispatchEvent(new CustomEvent(PERSISTENT_VIDEO_FULLSCREEN_EVENT, {
    detail: { mediaId },
  }));
};

export const requestPersistentVideoPictureInPicture = (mediaId: string) => {
  window.dispatchEvent(new CustomEvent(PERSISTENT_VIDEO_PIP_EVENT, {
    detail: { mediaId },
  }));
};

type Listener = () => void;

const EMPTY_DOCKED_VIDEO: DockedVideoState | undefined = undefined;

let dockedVideo: DockedVideoState | undefined;
let detailVideoPageMediaId: string | undefined;
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

export const setDetailVideoPageActive = (mediaId: string, active: boolean) => {
  const next = active
    ? mediaId
    : detailVideoPageMediaId === mediaId ? undefined : detailVideoPageMediaId;
  if (detailVideoPageMediaId === next) { return; }
  detailVideoPageMediaId = next;
  notify();
};

export const getActiveDetailVideoMediaId = () => detailVideoPageMediaId;
