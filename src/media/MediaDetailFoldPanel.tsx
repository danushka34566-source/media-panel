'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import {
  DETAIL_VIDEO_FOLD_COMPLETE_EVENT,
  DETAIL_VIDEO_FOLD_GESTURE_EVENT,
  type DetailVideoFoldGesture,
} from './video-mini-player';

const RESET_TRANSITION =
  'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), ' +
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
  const commitTimerRef = useRef<number | undefined>(undefined);
  const transitionDoneRef = useRef(false);
  const commitStartedRef = useRef(false);

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
        }, 340);
      }
      const relatedGrid = document.querySelector<HTMLElement>(
        `[data-media-detail-related-grid="${mediaId}"]`,
      );
      if (relatedGrid) {
        relatedGrid.style.transition = animate ? 'opacity 160ms ease' : 'none';
        relatedGrid.style.opacity = '1';
        relatedGrid.style.visibility = '';
        relatedGrid.style.pointerEvents = '';
      }
    };
    const onGesture = (event: Event) => {
      const gesture = (event as CustomEvent<DetailVideoFoldGesture>).detail;
      if (!gesture || gesture.mediaId !== mediaId) { return; }
      const panel = panelRef.current;
      if (!panel) { return; }
      if (gesture.phase === 'cancel') {
        commitStartedRef.current = false;
        reset(true);
        return;
      }
      const pull = Math.max(0, gesture.deltaY);
      const progress = Math.min(1, pull / 180);
      const horizontalFollow = gesture.deltaX * 0.16;
      if (gesture.phase === 'move') {
        const relatedGrid = document.querySelector<HTMLElement>(
          `[data-media-detail-related-grid="${mediaId}"]`,
        );
        if (relatedGrid && pull > 12) {
          relatedGrid.style.transition = 'none';
          relatedGrid.style.opacity = '0';
          relatedGrid.style.visibility = 'hidden';
          relatedGrid.style.pointerEvents = 'none';
        }
        panel.style.transition = 'none';
        panel.style.willChange = 'transform, opacity';
        panel.style.transform = `translate3d(${horizontalFollow}px, ${pull}px, 0) ` +
          `scale(${1 - progress * 0.12})`;
        panel.style.opacity = `${1 - progress * 0.18}`;
        panel.style.borderRadius = `${progress * 16}px`;
        return;
      }
      transitionDoneRef.current = false;
      commitStartedRef.current = true;
      const relatedGrid = document.querySelector<HTMLElement>(
        `[data-media-detail-related-grid="${mediaId}"]`,
      );
      if (relatedGrid) {
        relatedGrid.style.transition = 'opacity 120ms ease';
        relatedGrid.style.opacity = '0';
        relatedGrid.style.visibility = 'hidden';
        relatedGrid.style.pointerEvents = 'none';
      }
      const commit = () => {
        if (transitionDoneRef.current || !panelRef.current) { return; }
        transitionDoneRef.current = true;
        window.dispatchEvent(new CustomEvent(
          DETAIL_VIDEO_FOLD_COMPLETE_EVENT,
          { detail: { mediaId } },
        ));
      };
      const animateCommit = () => {
        const currentPanel = panelRef.current;
        if (!currentPanel) { return; }
        const panelRect = currentPanel.getBoundingClientRect();
        const miniRect = document.querySelector<HTMLElement>(
          '[data-video-mini-player]',
        )?.getBoundingClientRect();
        const scale = miniRect && panelRect.width > 0
          ? Math.min(0.72, Math.max(0.18, miniRect.width / panelRect.width))
          : 0.72;
        const scaledWidth = panelRect.width * scale;
        const scaledHeight = panelRect.height * scale;
        const destination = miniRect ?? {
          left: window.innerWidth - Math.min(272, window.innerWidth - 16) - 16,
          top: window.innerHeight - 160 - 16,
          width: Math.min(272, window.innerWidth - 16),
          height: 160,
        };
        const targetX = destination.left - panelRect.left +
          (destination.width - scaledWidth) / 2;
        const targetY = destination.top - panelRect.top +
          (destination.height - scaledHeight) / 2;
        currentPanel.style.transition = RESET_TRANSITION;
        currentPanel.style.willChange = 'transform, opacity';
        currentPanel.style.pointerEvents = 'none';
        currentPanel.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) ` +
          `scale(${scale})`;
        currentPanel.style.opacity = '0';
        currentPanel.style.borderRadius = '18px';
        const onTransitionEnd = (event: TransitionEvent) => {
          if (event.propertyName === 'transform') { commit(); }
        };
        currentPanel.addEventListener('transitionend', onTransitionEnd, { once: true });
        if (commitTimerRef.current !== undefined) {
          window.clearTimeout(commitTimerRef.current);
        }
        commitTimerRef.current = window.setTimeout(commit, 360);
      };
      window.requestAnimationFrame(animateCommit);
    };
    const onResume = () => {
      if (!document.hidden && !commitStartedRef.current) { reset(false); }
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
      if (commitTimerRef.current !== undefined) {
        window.clearTimeout(commitTimerRef.current);
      }
    };
  }, [mediaId]);

  return <div
    ref={panelRef}
    className="relative z-[60] bg-main"
    data-media-detail-fold-panel={mediaId}
  >{children}</div>;
}
