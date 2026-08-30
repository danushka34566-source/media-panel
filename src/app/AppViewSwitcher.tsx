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
import { usePathname } from 'next/navigation';
import { KEY_COMMANDS } from '@/media/key-commands';
import { useAppText } from '@/i18n/state/client';
import IconSort from '@/components/icons/IconSort';
import { getSortStateFromPath } from '@/media/sort/path';
import { AnimatePresence, motion } from 'framer-motion';
import SortMenu from '@/media/sort/SortMenu';
import { SWR_KEYS } from '@/swr';
import {
  setMediaSortPreferenceAction,
} from '@/auth/actions';
import {
  captureMediaViewportAnchor,
  restoreMediaViewportAnchor,
} from '@/media/useMediaScrollRestoration';
import {
  getGridModeCardTransition,
  type GridModeCardRect,
} from '@/media/grid-mode-transition';

export type SwitcherSelection = 'full' | 'grid' | 'admin';

const GAP_CLASS_RIGHT = 'mr-1.5 sm:mr-2';
const GAP_CLASS_LEFT  = 'ml-0.5 sm:ml-1';
const GRID_MODE_SWITCH_DURATION_MS = 360;
const GRID_MODE_SWITCH_FEEDBACK_MS = GRID_MODE_SWITCH_DURATION_MS + 20;
const GRID_MODE_CAPTURE_BUFFER_PX = 96;
const activeGridModeAnimations = new WeakMap<HTMLElement, Animation>();

// Animate the plain card element, not its Framer Motion wrapper. Framer owns
// the wrapper transform and can overwrite a simultaneous WAAPI FLIP.
const getGridAnimationSurface = (card: HTMLElement) => card;

const captureVisibleGridCards = () => {
  const cards = new Map<string, GridModeCardRect>();
  const allSurfaces: HTMLElement[] = [];
  document.querySelectorAll<HTMLElement>(
    '[data-media-smart-preview-card][data-preview-id]',
  ).forEach(element => {
    const surface = getGridAnimationSurface(element);
    allSurfaces.push(surface);
    const rect = surface.getBoundingClientRect();
    if (
      rect.bottom <= -GRID_MODE_CAPTURE_BUFFER_PX ||
      rect.top >= window.innerHeight + GRID_MODE_CAPTURE_BUFFER_PX
    ) {
      return;
    }
    const id = element.dataset.previewId;
    if (id) {
      cards.set(id, {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
  });
  // Read every visual rectangle before cancelling an interrupted transition.
  // Cancelling in the same task cannot paint a jump, and the captured visual
  // positions become the starting point for the replacement transition.
  allSurfaces.forEach(surface => {
    activeGridModeAnimations.get(surface)?.cancel();
    activeGridModeAnimations.delete(surface);
  });
  return cards;
};

const animateVisibleGridCards = (
  previous: Map<string, GridModeCardRect>,
) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
  const pending: Array<{
    surface: HTMLElement
    transition: NonNullable<ReturnType<typeof getGridModeCardTransition>>
  }> = [];
  document.querySelectorAll<HTMLElement>(
    '[data-media-smart-preview-card][data-preview-id]',
  ).forEach(element => {
    const id = element.dataset.previewId;
    const from = id ? previous.get(id) : undefined;
    if (!from) { return; }
    const surface = getGridAnimationSurface(element);
    const rect = surface.getBoundingClientRect();
    const transition = getGridModeCardTransition(from, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    if (transition) { pending.push({ surface, transition }); }
  });
  // All final rectangles were read above. Starting each animation now keeps
  // the browser from painting the committed grid before its inverse transform
  // is active, eliminating the old "new layout, then animation" flash.
  pending.forEach(({ surface, transition }) => {
    const animation = surface.animate([
      {
        transform: transition.transform,
        transformOrigin: '0 0',
      },
      {
        transform: 'translate3d(0, 0, 0) scale(1, 1)',
        transformOrigin: '0 0',
      },
    ], {
      duration: GRID_MODE_SWITCH_DURATION_MS,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    });
    activeGridModeAnimations.set(surface, animation);
    void animation.finished.then(() => {
      if (activeGridModeAnimations.get(surface) === animation) {
        activeGridModeAnimations.delete(surface);
        animation.cancel();
      }
    }, () => undefined);
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
    hasExplicitSort,
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
  const sortPreferenceSaveRef = useRef<Promise<void>>(Promise.resolve());
  const lastQueuedSortPreferenceRef = useRef<string | undefined>(undefined);
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
    const preferenceKey = `${userEmail ?? 'anonymous'}:${sortBy}`;
    if (
      !isUserSignedIn ||
      !userEmail ||
      !doesPathOfferSort ||
      !hasExplicitSort ||
      lastQueuedSortPreferenceRef.current === preferenceKey
    ) { return; }

    lastQueuedSortPreferenceRef.current = preferenceKey;
    // Serialize saves so a slower earlier request cannot overwrite the user's
    // final newest/oldest or taken/uploaded selection in the account row.
    sortPreferenceSaveRef.current = sortPreferenceSaveRef.current
      .catch(() => undefined)
      .then(() => setMediaSortPreferenceAction(sortBy))
      .catch(() => undefined);
  }, [
    doesPathOfferSort,
    hasExplicitSort,
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
    const visibleCards = captureVisibleGridCards();
    document.documentElement.dataset.gridModeSwitching = 'true';
    // Commit the new column layout before restoring the visible card. This
    // prevents the same scrollTop from pointing at unrelated media when the
    // number and height of rows changes between grid modes.
    flushSync(() => {
      setIsGridModeSwitching(true);
      setIsWideGrid?.(prev => !prev);
    });
    restoreMediaViewportAnchor(viewportAnchor);
    animateVisibleGridCards(visibleCards);
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
        <AnimatePresence initial={false}>
          {canEdit &&
            <motion.div
              key="admin-menu"
              initial={{ opacity: 0, width: 0, scale: 0.92 }}
              animate={{ opacity: 1, width: 42, scale: 1 }}
              exit={{ opacity: 0, width: 0, scale: 0.92 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="shrink-0 overflow-hidden"
            >
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
              />
            </motion.div>}
        </AnimatePresence>
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
