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
  // Keep route content visible while its media asset loads. This preserves
  // directional/scale motion without leaving a blank page during navigation.
  fade?: boolean
  // Fixed descendants need their ancestor's transform removed after motion
  // settles. The animation itself still uses the original identity-transform
  // target so its interpolation remains identical to upstream.
  removeTransformAfterAnimation?: boolean
  layoutItems?: boolean
  layoutDependency?: string | number | boolean
  animateOnFirstLoadOnly?: boolean
  staggerOnFirstLoadOnly?: boolean
  animationItemLimit?: number
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
  removeTransformAfterAnimation = false,
  layoutItems = false,
  layoutDependency,
  animateOnFirstLoadOnly,
  staggerOnFirstLoadOnly,
  animationItemLimit,
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

  const shown: Variant = {
    opacity: 1,
    transform: 'translateX(0) translateY(0) scale(1)',
    ...removeTransformAfterAnimation && {
      transitionEnd: { transform: 'none' },
    },
  };

  return (
    <motion.div
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      initial={shouldAnimate ? 'hidden' : false}
      animate={canStart || IGNORE_CAN_START ? 'show' : 'hidden'}
      variants={shouldStagger && animationItemLimit === undefined
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
      {items.map((item, index) => {
        const shouldAnimateItem = shouldAnimate && (
          animationItemLimit === undefined || index < animationItemLimit
        );
        return <motion.div
          key={itemKeys ? itemKeys[index] : index}
          layout={layoutItems}
          layoutDependency={layoutDependency}
          className={classNameItem}
          variants={{
            hidden: shouldAnimateItem ? hidden : shown,
            show: shown,
          }}
          transition={{
            duration: shouldAnimateItem ? durationResolved : 0,
            ease: 'easeOut',
            ...shouldStagger &&
              animationItemLimit !== undefined &&
              shouldAnimateItem && {
              delay: index * staggerDelay,
            },
          }}
        >
          {item}
        </motion.div>;
      })}
    </motion.div>
  );
};

export default AnimateItems;
