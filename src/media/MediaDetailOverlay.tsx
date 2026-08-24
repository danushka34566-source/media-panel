'use client';

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  DETAIL_VIDEO_FOLD_GESTURE_EVENT,
  type DetailVideoFoldGesture,
} from './video-mini-player';

export default function MediaDetailOverlay({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-site-header]');
    if (!header) { return; }
    const update = () => setHeaderHeight(Math.max(
      0,
      Math.ceil(header.getBoundingClientRect().bottom),
    ));
    update();
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(update);
    observer?.observe(header);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth -
      document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { router.back(); }
    };
    const onFoldGesture = (event: Event) => {
      const gesture = (event as CustomEvent<DetailVideoFoldGesture>).detail;
      const backdrop = backdropRef.current;
      if (!gesture || !backdrop) { return; }
      if (gesture.phase === 'cancel') {
        backdrop.style.transition =
          'opacity 240ms ease, backdrop-filter 240ms ease';
        backdrop.style.opacity = '1';
        backdrop.style.backdropFilter = 'blur(14px)';
        return;
      }
      const progress = gesture.phase === 'commit'
        ? 1
        : Math.min(1, Math.max(0, gesture.deltaY) / 180);
      backdrop.style.transition = gesture.phase === 'commit'
        ? 'opacity 320ms cubic-bezier(0.22, 1, 0.36, 1), ' +
          'backdrop-filter 320ms ease'
        : 'none';
      backdrop.style.opacity = `${1 - progress}`;
      backdrop.style.backdropFilter = `blur(${14 * (1 - progress)}px)`;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(DETAIL_VIDEO_FOLD_GESTURE_EVENT, onFoldGesture);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(
        DETAIL_VIDEO_FOLD_GESTURE_EVENT,
        onFoldGesture,
      );
    };
  }, [router]);

  return (
    <div
      data-media-detail-overlay
      className="fixed inset-x-0 bottom-0 z-[45] overflow-y-auto
        overscroll-contain"
      style={{ top: headerHeight }}
      onPointerDown={event => {
        if (event.target === event.currentTarget) { router.back(); }
      }}
    >
      <motion.div
        ref={backdropRef}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 bg-white/[0.92]
          dark:bg-black/[0.92]"
        style={{ top: headerHeight, backdropFilter: 'blur(14px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      />
      <motion.div
        className="relative mx-3 mb-6 min-h-full pt-1.5 lg:mx-6"
        initial={{ opacity: 0, y: 22, scale: 0.992 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 390,
          damping: 36,
          mass: 0.8,
        }}
        onPointerDown={event => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  );
}
