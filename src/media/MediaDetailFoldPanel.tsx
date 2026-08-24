'use client';

import { type ReactNode, useLayoutEffect, useRef } from 'react';
import {
  DETAIL_VIDEO_FOLD_COMPLETE_EVENT,
  DETAIL_VIDEO_FOLD_GESTURE_EVENT,
  getDockedVideo,
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
  const activeGestureIdRef = useRef<number | undefined>(undefined);
  const committedGestureIdRef = useRef<number | undefined>(undefined);
  const unfoldFrameRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    activeGestureIdRef.current = undefined;
    committedGestureIdRef.current = undefined;
    commitStartedRef.current = false;
    transitionDoneRef.current = false;
    if (resetTimerRef.current !== undefined) {
      window.clearTimeout(resetTimerRef.current);
    }
    if (commitTimerRef.current !== undefined) {
      window.clearTimeout(commitTimerRef.current);
    }
    if (unfoldFrameRef.current !== undefined) {
      window.cancelAnimationFrame(unfoldFrameRef.current);
      unfoldFrameRef.current = undefined;
    }
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = 'none';
      panelRef.current.style.opacity = '1';
      panelRef.current.style.borderRadius = '0px';
      panelRef.current.style.pointerEvents = '';
      panelRef.current.style.willChange = '';
    }
    const docked = getDockedVideo();
    const mini = docked?.mediaId === mediaId && !docked.pendingHandoff
      ? document.querySelector<HTMLElement>(
        `[data-video-mini-player][data-media-id="${mediaId}"]`,
      )
      : undefined;
    if (mini && panelRef.current) {
      const panelRect = panelRef.current.getBoundingClientRect();
      const miniRect = mini.getBoundingClientRect();
      if (panelRect.width > 0 && miniRect.width > 0) {
        const scale = Math.min(0.72, Math.max(0.18,
          miniRect.width / panelRect.width));
        const translateX = miniRect.left + miniRect.width / 2 -
          (panelRect.left + panelRect.width / 2);
        const translateY = miniRect.top + miniRect.height / 2 -
          (panelRect.top + panelRect.height / 2);
        panelRef.current.style.transition = 'none';
        panelRef.current.style.transform =
          `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
        panelRef.current.style.borderRadius = '18px';
        panelRef.current.style.willChange = 'transform';
        unfoldFrameRef.current = window.requestAnimationFrame(() => {
          unfoldFrameRef.current = undefined;
          if (!panelRef.current) { return; }
          panelRef.current.style.transition = RESET_TRANSITION;
          panelRef.current.style.transform =
            'translate3d(0, 0, 0) scale(1)';
          panelRef.current.style.borderRadius = '0px';
        });
      }
    }
    const reset = (animate: boolean) => {
      const panel = panelRef.current;
      if (!panel) { return; }
      panel.dataset.foldCommitting = 'false';
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
      if (
        gesture.phase !== 'cancel' &&
        committedGestureIdRef.current !== undefined
      ) { return; }
      const panel = panelRef.current;
      if (!panel) { return; }
      if (gesture.phase === 'cancel') {
        if (commitStartedRef.current) { return; }
        commitStartedRef.current = false;
        activeGestureIdRef.current = undefined;
        reset(true);
        return;
      }
      if (
        activeGestureIdRef.current !== undefined &&
        gesture.gestureId !== undefined &&
        activeGestureIdRef.current !== gesture.gestureId
      ) { return; }
      if (gesture.gestureId !== undefined) {
        activeGestureIdRef.current = gesture.gestureId;
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
      committedGestureIdRef.current = gesture.gestureId;
      panel.dataset.foldCommitting = 'true';
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
        if (
          !currentPanel ||
          !commitStartedRef.current ||
          committedGestureIdRef.current !== gesture.gestureId
        ) { return; }
        // The panel has been following the finger with a temporary transform.
        // Measure its committed layout box before replacing that transform;
        // otherwise the pull offset is counted twice and the fold jumps.
        currentPanel.style.transition = 'none';
        currentPanel.style.transform = 'none';
        const panelRect = currentPanel.getBoundingClientRect();
        const miniRect = Array.from(
          document.querySelectorAll<HTMLElement>('[data-video-mini-player]'),
        ).find(element => element.dataset.mediaId === mediaId)
          ?.getBoundingClientRect();
        const scale = miniRect && panelRect.width > 0
          ? Math.min(0.72, Math.max(0.18, miniRect.width / panelRect.width))
          : 0.72;
        const destination = miniRect ?? {
          left: window.innerWidth - Math.min(272, window.innerWidth - 16) - 16,
          top: window.innerHeight - 160 - 16,
          width: Math.min(272, window.innerWidth - 16),
          height: 160,
        };
        // Framer/CSS scales around the panel center. Align centers directly;
        // adding scaled width/height here would double-count the transform
        // origin and leave the folded panel offset from the mini player.
        const targetX = destination.left + destination.width / 2 -
          (panelRect.left + panelRect.width / 2);
        const targetY = destination.top + destination.height / 2 -
          (panelRect.top + panelRect.height / 2);
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
    data-fold-committing="false"
  >{children}</div>;
}
