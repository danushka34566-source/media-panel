import Switcher from '@/components/switcher/Switcher';
import SwitcherItem from '@/components/switcher/SwitcherItem';
import IconFull from '@/components/icons/IconFull';
import IconGrid from '@/components/icons/IconGrid';
import {
  PATH_FULL_INFERRED,
  PATH_GRID_INFERRED,
} from '@/app/path';
import IconSearch from '../components/icons/IconSearch';
import { useAppState } from '@/app/AppState';
import {
  GRID_HOMEPAGE_ENABLED,
  SHOW_KEYBOARD_SHORTCUT_TOOLTIPS,
  NAV_SORT_CONTROL,
} from './config';
import AdminAppMenu from '@/admin/AdminAppMenu';
import clsx from 'clsx/lite';
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import useKeydownHandler from '@/utility/useKeydownHandler';
import { usePathname, useRouter } from 'next/navigation';
import { KEY_COMMANDS } from '@/media/key-commands';
import { useAppText } from '@/i18n/state/client';
import IconSort from '@/components/icons/IconSort';
import { getSortStateFromPath } from '@/media/sort/path';
import { motion } from 'framer-motion';
import SortMenu from '@/media/sort/SortMenu';
import { SWR_KEYS } from '@/swr';
import {
  setMediaSortPreferenceAction,
} from '@/auth/actions';
import {
  captureMediaViewportAnchor,
  restoreMediaViewportAnchor,
} from '@/media/useMediaScrollRestoration';

export type SwitcherSelection = 'full' | 'grid' | 'admin';

const GAP_CLASS_RIGHT = 'mr-1.5 sm:mr-2';
const GAP_CLASS_LEFT  = 'ml-0.5 sm:ml-1';
const GRID_MODE_SWITCH_FEEDBACK_MS = 320;
// Animate the viewport plus a small landing buffer. Cards newly exposed by a
// denser grid receive their own entrance motion when no old position exists.
const GRID_MODE_ANIMATION_OVERSCAN_VIEWPORTS = 0.5;

type GridCardLayout = {
  left: number
  top: number
};

const getGridAnimationOverscan = () => Math.max(
  240,
  window.innerHeight * GRID_MODE_ANIMATION_OVERSCAN_VIEWPORTS,
);

// Animate the plain card element, not its Framer Motion wrapper. Framer owns
// the wrapper transform and can overwrite a simultaneous WAAPI FLIP.
const getGridAnimationSurface = (card: HTMLElement) => card;

const captureGridCards = () => {
  const cards = new Map<string, GridCardLayout>();
  const overscan = getGridAnimationOverscan();
  document.querySelectorAll<HTMLElement>(
    '[data-media-smart-preview-card][data-preview-id]',
  ).forEach(element => {
    const surface = getGridAnimationSurface(element);
    // Keep the custom transform isolated from the outer Framer Motion item.
    surface.getAnimations().forEach(animation => animation.cancel());
    const rect = surface.getBoundingClientRect();
    if (rect.bottom <= -overscan || rect.top >= window.innerHeight + overscan) {
      return;
    }
    const id = element.dataset.previewId;
    if (id) {
      cards.set(id, {
        left: rect.left,
        top: rect.top,
      });
    }
  });
  return cards;
};

const animateGridCards = (previous: Map<string, GridCardLayout>) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
  // Wait for the browser to commit the new grid columns, then perform one
  // read/animate pass. Measuring immediately after flushSync can still read
  // the old grid track sizes on mobile browsers.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const overscan = getGridAnimationOverscan();
      document.querySelectorAll<HTMLElement>(
        '[data-media-smart-preview-card][data-preview-id]',
      ).forEach(element => {
        const id = element.dataset.previewId;
        const surface = getGridAnimationSurface(element);
        surface.getAnimations().forEach(animation => animation.cancel());
        const rect = surface.getBoundingClientRect();
        if (rect.bottom <= -overscan || rect.top >= window.innerHeight + overscan) {
          return;
        }
        const from = id ? previous.get(id) : undefined;
        if (!from) {
          const animation = surface.animate([
            { opacity: 0, transform: 'translate3d(0, 24px, 0) scale(0.96)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          ], {
            duration: 320,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'both',
          });
          void animation.finished.then(
            () => animation.cancel(),
            () => undefined,
          );
          return;
        }
        const x = from.left - rect.left;
        const y = from.top - rect.top;
        if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) { return; }
        const animation = surface.animate([
          { transform: `translate3d(${x}px, ${y}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ], {
          duration: 320,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
        });
        void animation.finished.then(
          () => animation.cancel(),
          () => undefined,
        );
      });
    });
  });
};

export default function AppViewSwitcher({
  currentSelection,
  className,
  animate = true,
  accessoryAfter,
  isAdminMenuOpen,
  setIsAdminMenuOpen,
}: {
  currentSelection?: SwitcherSelection
  className?: string
  animate?: boolean
  accessoryAfter?: ReactNode
  isAdminMenuOpen: boolean
  setIsAdminMenuOpen: (isOpen: boolean) => void
}) {
  const pathname = usePathname();
  const router = useRouter();
  
  const appText = useAppText();

  const {
    canEdit,
    setIsCommandKOpen,
    invalidateSwr,
    isWideGrid,
    setIsWideGrid,
    setShouldLoadAdminData,
    isUserSignedIn,
    userEmail,
  } = useAppState();

  const sortConfig = useMemo(
    () => getSortStateFromPath(pathname, appText),
    [pathname, appText],
  );

  const {
    sortBy,
    doesPathOfferSort,
    isSortedByDefault,
    isAscending,
    pathGrid,
    pathFull,
    pathSortToggle,
  } = sortConfig;

  const showSortControl =
    NAV_SORT_CONTROL !== 'none' &&
    doesPathOfferSort;

  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (hasLoadedRef.current) {
      // After initial load, invalidate cache every time sort changes
      invalidateSwr?.(SWR_KEYS.INFINITE_MEDIA_SCROLL);
    }
    hasLoadedRef.current = true;
  }, [invalidateSwr, sortBy]);

  useEffect(() => {
    // Bare feed routes resolve the saved preference on the server before the
    // first render. Reading it here and replacing the URL after hydration
    // caused a visible order correction and a second feed request. Explicit
    // sort routes are already authoritative, so only persist those choices.
    if (
      !isUserSignedIn ||
      !userEmail ||
      !doesPathOfferSort ||
      isSortedByDefault
    ) { return; }

    void setMediaSortPreferenceAction(sortBy).catch(() => {
      // Sorting stays fully usable when the preference store is unavailable.
    });
  }, [
    doesPathOfferSort,
    isSortedByDefault,
    isUserSignedIn,
    sortBy,
    userEmail,
  ]);

  const refHrefFull = useRef<HTMLAnchorElement>(null);
  const refHrefGrid = useRef<HTMLAnchorElement>(null);

  const [isSearchOpening, setIsSearchOpening] = useState(false);
  const [isGridModeSwitching, setIsGridModeSwitching] = useState(false);
  const gridModeSwitchTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchFeedbackTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toggleGridMode = useCallback(() => {
    const viewportAnchor = captureMediaViewportAnchor();
    const gridCards = captureGridCards();
    document.documentElement.dataset.gridModeSwitching = 'true';
    // Commit the new column layout before restoring the visible card. This
    // prevents the same scrollTop from pointing at unrelated media when the
    // number and height of rows changes between grid modes.
    flushSync(() => {
      setIsGridModeSwitching(true);
      setIsWideGrid?.(prev => !prev);
    });
    restoreMediaViewportAnchor(viewportAnchor);
    animateGridCards(gridCards);
    if (gridModeSwitchTimeoutRef.current) {
      clearTimeout(gridModeSwitchTimeoutRef.current);
    }
    gridModeSwitchTimeoutRef.current = setTimeout(() => {
      setIsGridModeSwitching(false);
      delete document.documentElement.dataset.gridModeSwitching;
      gridModeSwitchTimeoutRef.current = undefined;
    }, GRID_MODE_SWITCH_FEEDBACK_MS);
  }, [setIsWideGrid]);

  useEffect(() => () => {
    if (gridModeSwitchTimeoutRef.current) {
      clearTimeout(gridModeSwitchTimeoutRef.current);
      delete document.documentElement.dataset.gridModeSwitching;
    }
    if (searchFeedbackTimeoutRef.current) {
      clearTimeout(searchFeedbackTimeoutRef.current);
    }
  }, []);
  
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!e.metaKey) {
      switch (e.key.toLocaleUpperCase()) {
        case KEY_COMMANDS.full:
          if (pathname !== PATH_FULL_INFERRED) { refHrefFull.current?.click(); }
          break;
        case KEY_COMMANDS.grid:
          if (currentSelection === 'grid') {
            toggleGridMode();
          } else if (pathname !== PATH_GRID_INFERRED) {
            refHrefGrid.current?.click();
          }
          break;
        case KEY_COMMANDS.admin:
          if (canEdit) { setIsAdminMenuOpen(true); }
          break;
      }
    }
  }, [currentSelection, canEdit, pathname, toggleGridMode]);
  useKeydownHandler({ onKeyDown });

  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const renderItemFull =
    <SwitcherItem
      icon={<IconFull includeTitle={false} />}
      href={pathname === pathFull ? undefined : pathFull}
      hrefRef={refHrefFull}
      active={currentSelection === 'full'}
      tooltip={{...SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
        content: appText.nav.full,
        keyCommand: KEY_COMMANDS.full,
      }}}
      noPadding
    />;

  const renderItemGrid =
    <SwitcherItem
      icon={<motion.span
        animate={{ scale: isGridModeSwitching ? 0.9 : 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        <IconGrid
          includeTitle={false}
          variant={isWideGrid ? 'wide' : 'regular'}
        />
      </motion.span>}
      href={currentSelection === 'grid' ? undefined : pathGrid}
      hrefRef={refHrefGrid}
      active={currentSelection === 'grid'}
      onClick={() => {
        if (currentSelection === 'grid') {
          toggleGridMode();
        }
      }}
      tooltip={{...SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
        content: isGridModeSwitching
          ? `${appText.nav.grid}…`
          : currentSelection === 'grid'
            ? `${appText.nav.grid} 16:9`
            : appText.nav.grid,
        keyCommand: KEY_COMMANDS.grid,
      }}}
      noPadding
    />;

  return (
    <div className={clsx('flex', className)}>
      <Switcher
        className={clsx(
          GAP_CLASS_RIGHT,
          // Apply offset due to outline strategy
          'translate-x-px',
        )}
      >
        {GRID_HOMEPAGE_ENABLED ? renderItemGrid : renderItemFull}
        {GRID_HOMEPAGE_ENABLED ? renderItemFull : renderItemGrid}
        <SwitcherItem
          icon={<motion.span
            animate={{ scale: isSearchOpening ? 0.9 : 1 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            <IconSearch includeTitle={false} />
          </motion.span>}
          onClick={() => {
            setIsSearchOpening(true);
            setIsCommandKOpen?.(true);
            if (searchFeedbackTimeoutRef.current) {
              clearTimeout(searchFeedbackTimeoutRef.current);
            }
            searchFeedbackTimeoutRef.current = setTimeout(() => {
              setIsSearchOpening(false);
              searchFeedbackTimeoutRef.current = undefined;
            }, 180);
          }}
          className="translate-y-[-0.5px]"
          tooltip={{...SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
            content: appText.nav.search,
            keyCommandModifier: KEY_COMMANDS.search[0],
            keyCommand: KEY_COMMANDS.search[1],
          }}}
        />
        {canEdit &&
          <SwitcherItem
            icon={<AdminAppMenu
              isOpen={isAdminMenuOpen}
              setIsOpen={isOpen => {
                setIsAdminMenuOpen(isOpen);
                if (isOpen) { setShouldLoadAdminData?.(true); }
                if (isOpen) { setIsSortMenuOpen(false); }
              }}
            />}
            tooltip={{
              ...!isAdminMenuOpen && SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
                content: appText.nav.admin,
                keyCommand: KEY_COMMANDS.admin,
              },
            }}
            noPadding
          />}
      </Switcher>
      <motion.div
        initial={animate ? { opacity: 0, width: '0' } : false}
        animate={{ opacity: 1, width: showSortControl ? 'auto' : '0' }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <Switcher
          className={clsx('max-sm:hidden', GAP_CLASS_LEFT)}
          type="borderless"
        >
          {NAV_SORT_CONTROL === 'menu'
            ? <SwitcherItem
              className={clsx(
                !isSortedByDefault && '*:bg-medium *:text-main!',
              )}
              icon={<SortMenu
                {...sortConfig}
                isOpen={isSortMenuOpen}
                setIsOpen={isOpen => {
                  setIsSortMenuOpen(isOpen);
                  if (isOpen) { setIsAdminMenuOpen(false); }
                }}
              />}
              tooltip={{
                ...!isSortMenuOpen && SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
                  content: appText.sort.sort,
                },
              }}
              width="narrow"
              noPadding
            />
            : <SwitcherItem
              className={clsx(
                '*:w-full *:h-full *:flex *:items-center *:justify-center',
                !isSortedByDefault && '*:bg-medium *:text-main!',
              )}
              href={pathSortToggle}
              icon={<IconSort
                sort={isAscending ? 'asc' : 'desc'}
                className="translate-x-[0.5px] translate-y-px"
              />}
              tooltip={{...SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
                content: isAscending
                  ? appText.sort.viewNewest
                  : appText.sort.viewOldest,
              }}}
              width="narrow"
              noPadding
            />}
        </Switcher>
      </motion.div>
      <Switcher type="borderless" className="ml-1 sm:ml-1.5 gap-1 divide-x-0">
        {accessoryAfter}
      </Switcher>
    </div>
  );
}
