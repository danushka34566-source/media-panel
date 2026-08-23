'use client';

import { ReactNode, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAppState } from '@/app/AppState';
import usePrefersReducedMotion from '@/utility/usePrefersReducedMotion';

/**
 * A small directional transition for the detail hero.
 *
 * The old shared item animation scaled and faded the entire hero. That made
 * the player briefly disappear while adjacent metadata/cards were loading.
 * This transition keeps the hero fully opaque and only moves it a few pixels,
 * so navigation still feels intentional without a black flash or layout jump.
 */
export default function MediaDetailHeroTransition({
  children,
}: {
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

  return (
    <motion.div
      className="md:mb-8"
      initial={shouldAnimate ? { opacity: 1, x: initialX } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: Math.min(Math.max(animation.current?.duration ?? 0.2, 0.16), 0.28),
        ease: [0.22, 1, 0.36, 1],
      }}
      onAnimationStart={() => {
        animationId.current = getNextMediaAnimationId?.();
      }}
      onAnimationComplete={() => {
        if (shouldAnimate) {
          clearNextMediaAnimation?.(animationId.current);
        }
      }}
    >
      {children}
    </motion.div>
  );
}
