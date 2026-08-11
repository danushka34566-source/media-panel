'use client';

import { useAppState } from '@/app/AppState';
import IconSearch from '@/components/icons/IconSearch';
import { clsx } from 'clsx/lite';
import { IoRefresh } from 'react-icons/io5';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const SEARCH_PULL_THRESHOLD_PX = 72;
const REFRESH_PULL_THRESHOLD_PX = 180;
const MAX_PULL_START_SCROLL_Y = 32;
const MAX_PULL_VISUAL_PX = 210;
const VISUAL_PULL_DAMPING = 0.68;
const GESTURE_AXIS_LOCK_DISTANCE_PX = 12;
const VERTICAL_PULL_DIRECTION_RATIO = 1.15;
const HORIZONTAL_CANCEL_RATIO = 1.05;

const triggerHaptic = (duration = 10) => {
  if (typeof navigator === 'undefined') {
    return;
  }

  const didVibrate =
    typeof navigator.vibrate === 'function' &&
    navigator.vibrate(duration);

  if (didVibrate) {
    return;
  }

  const gamepads = navigator.getGamepads?.() ?? [];
  for (const gamepad of gamepads) {
    const actuator = gamepad?.vibrationActuator;
    if (typeof actuator?.playEffect === 'function') {
      void actuator.playEffect('dual-rumble', {
        duration,
        startDelay: 0,
        weakMagnitude: 1,
        strongMagnitude: 1,
      });
      return;
    }

    const pulseActuator = actuator as
      | (GamepadHapticActuator & {
        pulse?: (value: number, duration: number) => Promise<boolean>;
      })
      | undefined;

    if (typeof pulseActuator?.pulse === 'function') {
      void pulseActuator.pulse(1, duration);
      return;
    }

    const hapticActuator = (
      gamepad as Gamepad & {
        hapticActuators?: Array<{
          pulse?: (value: number, duration: number) => Promise<boolean>;
        }>;
      }
    )?.hapticActuators?.[0];
    if (typeof hapticActuator?.pulse === 'function') {
      void hapticActuator.pulse(1, duration);
      return;
    }
  }
};

const isInteractiveElement = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest([
    'input',
    'textarea',
    'select',
    'button',
    '[role="button"]',
    '[data-radix-popper-content-wrapper]',
    '[cmdk-root]',
  ].join(', ')));

export default function MobilePullGesture() {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  const {
    invalidateSwr,
    isCommandKOpen,
    setIsCommandKOpen,
  } = useAppState();
  const startXRef = useRef<number | undefined>(undefined);
  const startYRef = useRef<number | undefined>(undefined);
  const currentDeltaYRef = useRef(0);
  const shouldHandleRef = useRef(false);
  const gestureAxisRef = useRef<'pending' | 'vertical' | 'horizontal'>('pending');
  const didTriggerEngageHapticRef = useRef(false);
  const didTriggerSearchHapticRef = useRef(false);
  const didTriggerRefreshHapticRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    if (isAdminPage) { return; }

    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;
    const previousHtmlOverscroll = htmlStyle.overscrollBehaviorY;
    const previousBodyOverscroll = bodyStyle.overscrollBehaviorY;
    htmlStyle.overscrollBehaviorY = 'none';
    bodyStyle.overscrollBehaviorY = 'none';

    const resetGesture = () => {
      shouldHandleRef.current = false;
      startXRef.current = undefined;
      startYRef.current = undefined;
      gestureAxisRef.current = 'pending';
      currentDeltaYRef.current = 0;
      didTriggerEngageHapticRef.current = false;
      didTriggerSearchHapticRef.current = false;
      didTriggerRefreshHapticRef.current = false;
      setPullDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) { return; }
      shouldHandleRef.current =
        window.scrollY <= MAX_PULL_START_SCROLL_Y &&
        !isCommandKOpen &&
        !isInteractiveElement(event.target);
      startXRef.current = shouldHandleRef.current ? touch.clientX : undefined;
      startYRef.current = shouldHandleRef.current ? touch.clientY : undefined;
      gestureAxisRef.current = 'pending';
      currentDeltaYRef.current = 0;
      didTriggerEngageHapticRef.current = false;
      didTriggerSearchHapticRef.current = false;
      didTriggerRefreshHapticRef.current = false;
      setPullDistance(0);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (
        !shouldHandleRef.current ||
        startXRef.current === undefined ||
        startYRef.current === undefined
      ) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) { return; }
      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const visualDeltaY = Math.min(MAX_PULL_VISUAL_PX, deltaY * VISUAL_PULL_DAMPING);

      if (gestureAxisRef.current === 'pending') {
        const hasEnoughMovement =
          absX >= GESTURE_AXIS_LOCK_DISTANCE_PX ||
          absY >= GESTURE_AXIS_LOCK_DISTANCE_PX;
        if (!hasEnoughMovement) {
          return;
        }
        if (deltaY > 0 && absY > absX * VERTICAL_PULL_DIRECTION_RATIO) {
          gestureAxisRef.current = 'vertical';
          if (!didTriggerEngageHapticRef.current) {
            triggerHaptic(8);
            didTriggerEngageHapticRef.current = true;
          }
        } else if (absX > absY * HORIZONTAL_CANCEL_RATIO) {
          gestureAxisRef.current = 'horizontal';
        } else {
          return;
        }
      }

      if (gestureAxisRef.current === 'horizontal') {
        shouldHandleRef.current = false;
        startXRef.current = undefined;
        startYRef.current = undefined;
        currentDeltaYRef.current = 0;
        didTriggerEngageHapticRef.current = false;
        didTriggerSearchHapticRef.current = false;
        didTriggerRefreshHapticRef.current = false;
        setPullDistance(0);
        return;
      }

      if (deltaY <= 0) {
        currentDeltaYRef.current = 0;
        didTriggerSearchHapticRef.current = false;
        didTriggerRefreshHapticRef.current = false;
        setPullDistance(0);
        return;
      }
      event.preventDefault();
      currentDeltaYRef.current = visualDeltaY;
      if (
        currentDeltaYRef.current >= SEARCH_PULL_THRESHOLD_PX &&
        !didTriggerSearchHapticRef.current
      ) {
        triggerHaptic(12);
        didTriggerSearchHapticRef.current = true;
      }
      if (currentDeltaYRef.current < SEARCH_PULL_THRESHOLD_PX) {
        didTriggerSearchHapticRef.current = false;
      }
      if (
        currentDeltaYRef.current >= REFRESH_PULL_THRESHOLD_PX &&
        !didTriggerRefreshHapticRef.current
      ) {
        triggerHaptic(18);
        didTriggerRefreshHapticRef.current = true;
      }
      if (currentDeltaYRef.current < REFRESH_PULL_THRESHOLD_PX) {
        didTriggerRefreshHapticRef.current = false;
      }
      setPullDistance(visualDeltaY);
    };

    const onTouchEnd = () => {
      if (!shouldHandleRef.current) {
        startXRef.current = undefined;
        startYRef.current = undefined;
        gestureAxisRef.current = 'pending';
        currentDeltaYRef.current = 0;
        didTriggerEngageHapticRef.current = false;
        setPullDistance(0);
        return;
      }
      const releasedDeltaY = currentDeltaYRef.current;
      shouldHandleRef.current = false;
      startXRef.current = undefined;
      startYRef.current = undefined;
      gestureAxisRef.current = 'pending';
      currentDeltaYRef.current = 0;
      didTriggerEngageHapticRef.current = false;
      didTriggerSearchHapticRef.current = false;
      didTriggerRefreshHapticRef.current = false;
      setPullDistance(0);
      if (releasedDeltaY >= REFRESH_PULL_THRESHOLD_PX) {
        triggerHaptic(24);
        invalidateSwr?.();
        router.refresh();
        return;
      }
      if (releasedDeltaY >= SEARCH_PULL_THRESHOLD_PX) {
        triggerHaptic(16);
        setIsCommandKOpen?.(true);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('pagehide', resetGesture);
    window.addEventListener('pageshow', resetGesture);
    const onVisibilityChange = () => {
      if (document.hidden) { resetGesture(); }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      htmlStyle.overscrollBehaviorY = previousHtmlOverscroll;
      bodyStyle.overscrollBehaviorY = previousBodyOverscroll;
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pagehide', resetGesture);
      window.removeEventListener('pageshow', resetGesture);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    invalidateSwr,
    isAdminPage,
    isCommandKOpen,
    router,
    setIsCommandKOpen,
  ]);

  if (isAdminPage) { return null; }

  const visualPull = Math.min(MAX_PULL_VISUAL_PX, pullDistance);
  const isVisible = visualPull > 0;
  const isRefreshReady = visualPull >= REFRESH_PULL_THRESHOLD_PX;
  const isSearchReady = visualPull >= SEARCH_PULL_THRESHOLD_PX;
  const ringProgress = Math.max(
    0,
    Math.min(1, visualPull / REFRESH_PULL_THRESHOLD_PX),
  );
  const label = isRefreshReady
    ? 'Release to refresh'
    : isSearchReady
      ? 'Release to open search'
      : 'Pull to search';
  const sublabel = isRefreshReady
    ? 'Refresh ready'
    : isSearchReady
      ? 'Pull farther to refresh instead'
      : 'Start from the top of the page';

  return (
    <div
      className={clsx(
        'pointer-events-none fixed inset-x-0 top-0 z-[80] h-44',
        'transition-opacity duration-150',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
      aria-hidden="true"
    >
      <div className={clsx(
        'absolute inset-0 bg-gradient-to-b from-white/75 to-transparent',
        'backdrop-blur-[2px] dark:from-black/65',
        '[mask-image:linear-gradient(to_bottom,black_55%,transparent)]',
      )} />
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <div
          className={clsx(
            'relative mt-2 flex min-w-[14rem] items-center gap-2.5',
            'rounded-full border border-medium px-3.5 py-2.5',
            'bg-white/85 text-main shadow-lg shadow-black/10 backdrop-blur-xl',
            'dark:bg-black/70 dark:shadow-black/30',
            isRefreshReady && 'ring-1 ring-main/20',
          )}
          style={{
            transform: `translateY(${Math.max(0, visualPull * 0.42 - 18)}px) scale(${0.96 + Math.min(visualPull / 500, 0.06)})`,
          }}
        >
          <span
            className="pointer-events-none absolute inset-[-1px] rounded-full"
            style={{
              opacity: isVisible ? 1 : 0,
              background: `conic-gradient(from -90deg, currentColor ${ringProgress * 360}deg, transparent 0deg)`,
              WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              padding: '1.5px',
            }}
          />
          <div className="flex size-7 items-center justify-center">
            <span className="relative block size-7">
              <span className={clsx(
                'absolute inset-0 flex items-center justify-center text-main transition-transform duration-150',
                isRefreshReady && 'scale-105',
              )}>
                {isRefreshReady
                  ? <IoRefresh size={14} />
                  : <IconSearch includeTitle={false} />}
              </span>
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-none">{label}</div>
            <div className="mt-1 text-[11px] leading-none text-dim">{sublabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
