'use client';

const DETAIL_PREVIEW_STARTUP_EVENT = 'detail-preview-startup';
let currentMediaId: string | undefined;
let isCurrentPreviewPrepared = false;

const dispatchState = () => window.dispatchEvent(new CustomEvent(
  DETAIL_PREVIEW_STARTUP_EVENT,
  { detail: { mediaId: currentMediaId, prepared: isCurrentPreviewPrepared } },
));

export const beginDetailPreviewStartup = (mediaId: string) => {
  currentMediaId = mediaId;
  isCurrentPreviewPrepared = false;
  dispatchState();
};

export const completeDetailPreviewStartup = (mediaId: string) => {
  if (currentMediaId !== mediaId) { return; }
  isCurrentPreviewPrepared = true;
  dispatchState();
};

export const isDetailPreviewStartupComplete = (mediaId: string) =>
  currentMediaId === mediaId && isCurrentPreviewPrepared;

export const subscribeDetailPreviewStartup = (
  listener: (state: { mediaId?: string, prepared: boolean }) => void,
) => {
  const onState = (event: Event) => listener((event as CustomEvent<{
    mediaId?: string
    prepared: boolean
  }>).detail);
  window.addEventListener(DETAIL_PREVIEW_STARTUP_EVENT, onState);
  return () => window.removeEventListener(DETAIL_PREVIEW_STARTUP_EVENT, onState);
};
