'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAppState } from '@/app/AppState';
import usePrefersReducedMotion from '@/utility/usePrefersReducedMotion';

export const DETAIL_HERO_READY_EVENT = 'media-detail-hero-ready';

/**
 * A small directional transition for the detail hero.
 *
 * The old shared item animation scaled and faded the entire hero. That made
 * the player briefly disappear while adjacent metadata/cards were loading.
 * This transition keeps the hero fully opaque and only moves it a few pixels,
 * so navigation still feels intentional without a black flash or layout jump.
 */
export default function MediaDetailHeroTransition({
  mediaId,
  children,
}: {
  mediaId: string
  children: ReactNode
}) {
  const {
    nextMediaAnimation,
    getNextMediaAnimationId,
    clearNextMediaAnimation,
  } = useAppState();
  const prefersReducedMotion = usePrefersReducedMotion();
  const animation = useRef(nextMediaAnimation);
  const animationId = useRef<string | undefined>(undefined);
  const direction = animation.current?.type;
  const shouldAnimate = !prefersReducedMotion &&
    (direction === 'left' || direction === 'right');
  const distance = Math.min(
    Math.max(animation.current?.distanceOffset ?? 12, 6),
    20,
  );
  const initialX = direction === 'left' ? distance : -distance;

  useEffect(() => () => {
    // Clear a queued directional animation if reduced-motion mode or a fast
    // route change prevents Framer Motion from reaching its completion hook.
    if (animationId.current) {
      clearNextMediaAnimation?.(animationId.current);
    }
  }, [clearNextMediaAnimation]);

  return (
    <motion.div
      className="md:mb-8"
      initial={shouldAnimate ? { opacity: 1, x: initialX } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: Math.min(
          Math.max(animation.current?.duration ?? 0.2, 0.16),
          0.28,
        ),
        ease: [0.22, 1, 0.36, 1],
      }}
      onAnimationStart={() => {
        if (shouldAnimate) {
          animationId.current = getNextMediaAnimationId?.();
        }
      }}
      onAnimationComplete={() => {
        if (animationId.current) {
          clearNextMediaAnimation?.(animationId.current);
        }
        // Related cards listen for this boundary and mount after the hero has
        // settled, keeping their image work out of the transition's critical
        // frames. The timer fallback in MediaGrid covers reduced-motion and
        // browsers that skip Framer's completion callback.
        window.dispatchEvent(new CustomEvent(DETAIL_HERO_READY_EVENT, {
          detail: { mediaId },
        }));
      }}
    >
      {children}
    </motion.div>
  );
}
