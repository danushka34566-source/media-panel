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
import Spinner from '@/components/Spinner';
import clsx from 'clsx/lite';
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useKeydownHandler from '@/utility/useKeydownHandler';
import { usePathname, useRouter } from 'next/navigation';
import { KEY_COMMANDS } from '@/media/key-commands';
import { useAppText } from '@/i18n/state/client';
import IconSort from '@/components/icons/IconSort';
import { getPathForSortBy, getSortStateFromPath } from '@/media/sort/path';
import { motion } from 'framer-motion';
import SortMenu from '@/media/sort/SortMenu';
import { SWR_KEYS } from '@/swr';
import {
  getMediaSortPreferenceAction,
  setMediaSortPreferenceAction,
} from '@/auth/actions';

export type SwitcherSelection = 'full' | 'grid' | 'admin';

const GAP_CLASS_RIGHT = 'mr-1.5 sm:mr-2';
const GAP_CLASS_LEFT  = 'ml-0.5 sm:ml-1';
const GRID_MODE_SWITCH_FEEDBACK_MS = 220;

export default function AppViewSwitcher({
  currentSelection,
  className,
  animate = true,
  accessoryBeforeSearch,
}: {
  currentSelection?: SwitcherSelection
  className?: string
  animate?: boolean
  accessoryBeforeSearch?: ReactNode
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
  const sortPreferenceReadyRef = useRef(false);
  const sortPreferenceUserRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (hasLoadedRef.current) {
      // After initial load, invalidate cache every time sort changes
      invalidateSwr?.(SWR_KEYS.INFINITE_MEDIA_SCROLL);
    }
    hasLoadedRef.current = true;
  }, [invalidateSwr, sortBy]);

  useEffect(() => {
    sortPreferenceReadyRef.current = false;
    sortPreferenceUserRef.current = userEmail;
    if (!isUserSignedIn || !userEmail || !doesPathOfferSort) { return; }

    let cancelled = false;
    void getMediaSortPreferenceAction().then(preference => {
      if (cancelled || sortPreferenceUserRef.current !== userEmail) { return; }
      if (preference && preference !== sortBy && isSortedByDefault) {
        router.replace(getPathForSortBy(pathname, preference));
        return;
      }
      sortPreferenceReadyRef.current = true;
    }).catch(() => {
      sortPreferenceReadyRef.current = true;
    });
    return () => { cancelled = true; };
  }, [doesPathOfferSort, isSortedByDefault, isUserSignedIn, pathname, router, sortBy, userEmail]);

  useEffect(() => {
    if (
      !sortPreferenceReadyRef.current ||
      !isUserSignedIn ||
      !doesPathOfferSort
    ) { return; }
    void setMediaSortPreferenceAction(sortBy).catch(() => undefined);
  }, [doesPathOfferSort, isUserSignedIn, sortBy]);

  const refHrefFull = useRef<HTMLAnchorElement>(null);
  const refHrefGrid = useRef<HTMLAnchorElement>(null);

  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isGridModeSwitching, setIsGridModeSwitching] = useState(false);
  const gridModeSwitchTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toggleGridMode = useCallback(() => {
    setIsGridModeSwitching(true);
    setIsWideGrid?.(prev => !prev);
    if (gridModeSwitchTimeoutRef.current) {
      clearTimeout(gridModeSwitchTimeoutRef.current);
    }
    gridModeSwitchTimeoutRef.current = setTimeout(() => {
      setIsGridModeSwitching(false);
      gridModeSwitchTimeoutRef.current = undefined;
    }, GRID_MODE_SWITCH_FEEDBACK_MS);
  }, [setIsWideGrid]);

  useEffect(() => () => {
    if (gridModeSwitchTimeoutRef.current) {
      clearTimeout(gridModeSwitchTimeoutRef.current);
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
      href={pathFull}
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
      icon={isGridModeSwitching
        ? <Spinner
          size={13}
          color={currentSelection === 'grid' ? 'text' : 'light-gray'}
        />
        : <IconGrid
          includeTitle={false}
          variant={isWideGrid ? 'wide' : 'regular'}
          className={clsx(
            'transition-transform duration-200 ease-out',
          )}
        />}
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
      <Switcher type="borderless" className="ml-0 gap-1 divide-x-0">
        <SwitcherItem
          icon={<IconSearch includeTitle={false} />}
          onClick={() => setIsCommandKOpen?.(true)}
          className="w-[38px]! translate-y-[-0.5px]"
          tooltip={{...SHOW_KEYBOARD_SHORTCUT_TOOLTIPS && {
            content: appText.nav.search,
            keyCommandModifier: KEY_COMMANDS.search[0],
            keyCommand: KEY_COMMANDS.search[1],
          }}}
          width="narrow"
        />
        {accessoryBeforeSearch}
      </Switcher>
    </div>
  );
}
