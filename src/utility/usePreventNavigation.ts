import { useAppState } from '@/app/AppState';
import { useEffect, useRef } from 'react';

export default function usePreventNavigation(
  enabled?: boolean,
  // eslint-disable-next-line max-len
  confirmation = 'Are you sure you want to leave this page? Any unsaved changes will be lost.',
  includeButtons?: boolean,
) {
  const { confirmDialog } = useAppState();
  const shouldBypassNextNavigationRef = useRef(false);

  useEffect(() => {
    const callback = (e: MouseEvent) => {
      if (shouldBypassNextNavigationRef.current) {
        shouldBypassNextNavigationRef.current = false;
        return;
      }
      const target = e.target as HTMLElement | undefined;
      const parent = target?.parentElement as HTMLElement | undefined;
      const grandParent = parent?.parentElement as HTMLElement | undefined;
      const targets = [target, parent, grandParent];
      const anchor = targets.find(
        candidate => candidate?.tagName === 'A',
      ) as HTMLAnchorElement | undefined;
      if (
        anchor && (
          !includeButtons ||
          targets.some(target => target?.tagName === 'BUTTON')
        )
      ) {
        if (!enabled) { return; }
        e.stopPropagation();
        e.preventDefault();
        void confirmDialog?.({
          title: 'Unsaved Changes',
          description: confirmation,
          confirmLabel: 'Leave Page',
          tone: 'danger',
        }).then(didConfirm => {
          if (!didConfirm) { return; }
          shouldBypassNextNavigationRef.current = true;
          anchor.click();
        });
      }
    };
    document.addEventListener('click', callback, true);
    return () => document.removeEventListener('click', callback, true);
  }, [enabled, confirmation, includeButtons, confirmDialog]);
}
