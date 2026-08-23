'use client';

import { PointerEventHandler, ReactNode, useRef } from 'react';
import { Variant, motion, stagger } from 'framer-motion';
import { useAppState } from '@/app/AppState';
import usePrefersReducedMotion from '@/utility/usePrefersReducedMotion';

const IGNORE_CAN_START = true;

export type AnimationType = 'none' | 'scale' | 'left' | 'right' | 'bottom';

export interface AnimationConfig {
  type?: AnimationType
  duration?: number
  staggerDelay?: number
  scaleOffset?: number
  distanceOffset?: number
}

interface Props extends AnimationConfig {
  className?: string
  classNameItem?: string
  items: ReactNode[]
  itemKeys?: string[]
  canStart?: boolean
  animateFromAppState?: boolean
  // Keep route content visible while its media asset loads. This preserves a
  // directional transition without the full-page black veil caused by a
  // zero-opacity entrance state.
  fade?: boolean
  animateOnFirstLoadOnly?: boolean
  staggerOnFirstLoadOnly?: boolean
  onAnimationComplete?: () => void
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
}

function AnimateItems({
  className,
  classNameItem,
  items,
  itemKeys,
  canStart = true,
  type = 'scale',
  duration = 0.6,
  staggerDelay = 0.1,
  scaleOffset = 0.9,
  distanceOffset = 20,
  animateFromAppState,
  fade = true,
  animateOnFirstLoadOnly,
  staggerOnFirstLoadOnly,
  onAnimationComplete,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
}: Props) {
  const {
    hasLoadedWithAnimations,
    nextMediaAnimation,
    getNextMediaAnimationId,
    clearNextMediaAnimation,
  } = useAppState();

  const nextMediaAnimationId = useRef<string>(undefined);

  const prefersReducedMotion = usePrefersReducedMotion();
  
  const nextMediaAnimationInitial = useRef(nextMediaAnimation);

  const shouldAnimate = type !== 'none' &&
    !prefersReducedMotion &&
    !(animateOnFirstLoadOnly && hasLoadedWithAnimations);
  const shouldStagger =
    !(staggerOnFirstLoadOnly && hasLoadedWithAnimations);

  const typeResolved = animateFromAppState
    ? (nextMediaAnimationInitial.current?.type ?? type)
    : type;

  const durationResolved = animateFromAppState
    ? (nextMediaAnimationInitial.current?.duration ?? duration)
    : duration;

  const hidden: Variant =
    (() => {
      switch (typeResolved) {
        case 'left': return {
          opacity: fade ? 0 : 1,
          transform: `translateX(${distanceOffset}px)`,
        };
        case 'right': return {
          opacity: fade ? 0 : 1,
          transform: `translateX(${-distanceOffset}px)`,
        };
        case 'bottom': return {
          opacity: fade ? 0 : 1,
          transform: `translateY(${distanceOffset}px)`,
        };
        default: return {
          opacity: fade ? 0 : 1,
          transform: `translateY(${distanceOffset}px) scale(${scaleOffset})`,
        };
      }})();

  return (
    <motion.div
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      initial={shouldAnimate ? 'hidden' : false}
      animate={canStart || IGNORE_CAN_START ? 'show' : 'hidden'}
      variants={shouldStagger
        ? {
          show: {
            transition: {
              delayChildren: stagger(staggerDelay),
            },
          },
        } : undefined}
      onAnimationStart={() => {
        nextMediaAnimationId.current = getNextMediaAnimationId?.();
      }}
      onAnimationComplete={() => {
        if (animateFromAppState) {
          clearNextMediaAnimation?.(nextMediaAnimationId.current);
        }
        onAnimationComplete?.();
      }}
    >
      {items.map((item, index) =>
        <motion.div
          key={itemKeys ? itemKeys[index] : index}
          className={classNameItem}
          variants={{
            hidden,
            show: {
              opacity: 1,
              // Remove the transform after the entrance transition. Keeping
              // an identity transform creates a containing block for fixed
              // descendants, which would make the full-page mini player
              // scroll away with its original card.
              transform: 'none',
            },
          }}
          transition={{
            duration: durationResolved,
            ease: 'easeOut',
          }}
        >
          {item}
        </motion.div>)}
    </motion.div>
  );
};

export default AnimateItems;
