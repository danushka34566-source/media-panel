'use client';

import { useAppState } from '@/app/AppState';
import { PATH_SIGN_IN } from '@/app/path';
import { signOutAction } from '@/auth/actions';
import { useEffect, useRef } from 'react';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'media-panel:last-session-activity';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

const getLastActivity = () => {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

const storeLastActivity = (value: number) => {
  try { window.localStorage.setItem(LAST_ACTIVITY_KEY, `${value}`); } catch {}
};

export default function IdleSessionLogout() {
  const { isUserSignedIn } = useAppState();
  const logoutStartedRef = useRef(false);

  useEffect(() => {
    if (!isUserSignedIn) {
      logoutStartedRef.current = false;
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const logoutForInactivity = () => {
      if (logoutStartedRef.current) { return; }
      logoutStartedRef.current = true;
      void signOutAction().finally(() => {
        window.location.replace(PATH_SIGN_IN);
      });
    };
    const schedule = () => {
      if (timeout) { clearTimeout(timeout); }
      const lastActivity = getLastActivity() ?? Date.now();
      const remaining = lastActivity + IDLE_TIMEOUT_MS - Date.now();
      if (remaining <= 0) {
        logoutForInactivity();
        return;
      }
      timeout = setTimeout(logoutForInactivity, remaining);
    };
    const recordActivity = () => {
      if (logoutStartedRef.current) { return; }
      storeLastActivity(Date.now());
      schedule();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) { schedule(); }
    };
    const onVisibilityChange = () => {
      if (!document.hidden) { schedule(); }
    };

    if (!getLastActivity()) { storeLastActivity(Date.now()); }
    schedule();
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, recordActivity, {
      passive: true,
    }));
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timeout) { clearTimeout(timeout); }
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, recordActivity));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isUserSignedIn]);

  return null;
}
