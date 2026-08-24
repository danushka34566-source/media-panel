'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import {
  DETAIL_VIDEO_FOLD_GESTURE_EVENT,
  type DetailVideoFoldGesture,
} from './video-mini-player';

const RESET_TRANSITION =
  'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), ' +
  'opacity 180ms ease, border-radius 180ms ease';

export default function MediaDetailFoldPanel({
  mediaId,
  children,
}: {
  mediaId: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const resetTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reset = (animate: boolean) => {
      const panel = panelRef.current;
      if (!panel) { return; }
      if (resetTimerRef.current !== undefined) {
        window.clearTimeout(resetTimerRef.current);
      }
      panel.style.transition = animate ? RESET_TRANSITION : 'none';
      panel.style.transform = 'translate3d(0, 0, 0) scale(1)';
      panel.style.opacity = '1';
      panel.style.borderRadius = '0px';
      panel.style.pointerEvents = '';
      panel.style.willChange = animate ? 'transform, opacity' : '';
      if (animate) {
        resetTimerRef.current = window.setTimeout(() => {
          if (panelRef.current) {
            panelRef.current.style.transition = '';
            panelRef.current.style.willChange = '';
          }
        }, 260);
      }
    };
    const onGesture = (event: Event) => {
      const gesture = (event as CustomEvent<DetailVideoFoldGesture>).detail;
      if (!gesture || gesture.mediaId !== mediaId) { return; }
      const panel = panelRef.current;
      if (!panel) { return; }
      if (gesture.phase === 'cancel') {
        reset(true);
        return;
      }
      const pull = Math.max(0, gesture.deltaY);
      const progress = Math.min(1, pull / 180);
      const horizontalFollow = gesture.deltaX * 0.16;
      if (gesture.phase === 'move') {
        panel.style.transition = 'none';
        panel.style.willChange = 'transform, opacity';
        panel.style.transform = `translate3d(${horizontalFollow}px, ${pull}px, 0) ` +
          `scale(${1 - progress * 0.12})`;
        panel.style.opacity = `${1 - progress * 0.18}`;
        panel.style.borderRadius = `${progress * 16}px`;
        return;
      }
      const targetX = Math.min(window.innerWidth * 0.28, 220);
      const targetY = Math.max(pull, Math.min(window.innerHeight * 0.24, 240));
      panel.style.transition = RESET_TRANSITION;
      panel.style.willChange = 'transform, opacity';
      panel.style.pointerEvents = 'none';
      panel.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) ` +
        'scale(0.72)';
      panel.style.opacity = '0.18';
      panel.style.borderRadius = '18px';
    };
    const onResume = () => {
      if (!document.hidden) { reset(false); }
    };
    window.addEventListener(DETAIL_VIDEO_FOLD_GESTURE_EVENT, onGesture);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener(DETAIL_VIDEO_FOLD_GESTURE_EVENT, onGesture);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
      if (resetTimerRef.current !== undefined) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, [mediaId]);

  return <div ref={panelRef}>{children}</div>;
}
