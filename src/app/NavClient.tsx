'use client';

import { clsx } from 'clsx/lite';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import AppGrid from '../components/AppGrid';
import AppViewSwitcher, { SwitcherSelection } from '@/app/AppViewSwitcher';
import {
  PATH_ROOT,
  PATH_FAVORITES,
  PATH_PROFILE,
  isPathAdmin,
  isPathFull,
  isPathGrid,
  isPathProtected,
  isPathSignIn,
} from '@/app/path';
import AnimateItems from '../components/AnimateItems';
import {
  GRID_HOMEPAGE_ENABLED,
  NAV_CAPTION,
} from './config';
import { useRef, useState, useTransition } from 'react';
import useStickyNav from './useStickyNav';
import { useAppState } from '@/app/AppState';
import { signOutAction } from '@/auth/actions';
import UserAvatar from '@/components/UserAvatar';
import IconSignOut from '@/components/icons/IconSignOut';
import {
  IoChevronDown,
  IoChevronUp,
  IoHeartOutline,
  IoPersonCircleOutline,
  IoPersonOutline,
} from 'react-icons/io5';
import LinkWithStatus from '@/components/LinkWithStatus';
import Spinner from '@/components/Spinner';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

const NAV_HEIGHT_CLASS = NAV_CAPTION
  ? 'min-h-[4rem] sm:min-h-[5rem]'
  : 'min-h-[4rem]';

export default function NavClient({
  navTitle,
  navCaption,
  animate,
  user,
}: {
  navTitle: string
  navCaption?: string
  animate: boolean
  user?: {
    name?: string
    email?: string
    profileImageUrl?: string
  }
}) {
  const ref = useRef<HTMLElement>(null);
  const [isSigningOut, startSignOutTransition] = useTransition();

  const pathname = usePathname();
  const showNav = !isPathSignIn(pathname);

  const {
    hasLoadedWithAnimations,
    isUserSignedIn,
    isCheckingAuth,
    userEmail,
    userEmailEager,
    userName,
    userProfileImageUrl,
    clearAuthStateAndRedirectIfNecessary,
  } = useAppState();

  const {
    classNameStickyContainer,
    classNameStickyNav,
    isNavVisible,
  } = useStickyNav(ref, !isPathAdmin(pathname));

  const renderLink = (
    text: string,
    linkOrAction: string | (() => void),
  ) =>
    typeof linkOrAction === 'string'
      ? <Link href={linkOrAction}>{text}</Link>
      : <button onClick={linkOrAction} type="button">{text}</button>;

  const hasHydratedUser = Boolean(
    userEmail || userEmailEager || userName || userProfileImageUrl,
  );
  const hydratedUser = hasHydratedUser
    ? {
        name: userName,
        email: userEmail || userEmailEager,
        profileImageUrl: userProfileImageUrl,
      }
    : undefined;
  const effectiveUser = (
    isSigningOut || (!isCheckingAuth && !isUserSignedIn && !hasHydratedUser)
  ) ? undefined : user ?? hydratedUser;
  const isSignedIn = Boolean(effectiveUser?.email || effectiveUser?.name);
  const avatarLabel = effectiveUser?.name || effectiveUser?.email || 'Sign in';
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const renderAvatarMenuLink = (
    href: string,
    label: string,
    icon: ReactNode,
  ) => <DropdownMenu.Item asChild>
    <LinkWithStatus
      href={href}
      flickerThreshold={0}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-dim"
    >
      {({ isLoading }) => <>
        <span className={clsx(
          'flex size-4 items-center justify-center transition-opacity',
          isLoading && 'opacity-0',
        )}>
          {icon}
        </span>
        <span className="grow">{label}</span>
        {isLoading && <Spinner size={14} color="dim" />}
      </>}
    </LinkWithStatus>
  </DropdownMenu.Item>;

  const avatarDropdown = <DropdownMenu.Root
    open={isAvatarMenuOpen}
    onOpenChange={isOpen => {
      setIsAvatarMenuOpen(isOpen);
      if (isOpen) { setIsAdminMenuOpen(false); }
    }}
  >
    <DropdownMenu.Trigger asChild>
      <motion.button
        key={isSignedIn ? 'profile-menu' : 'sign-in-menu'}
        type="button"
        initial={{ opacity: 0, width: 28 }}
        animate={{ opacity: 1, width: 50 }}
        transition={{
          opacity: { duration: 0.16, ease: 'easeOut' },
          width: { delay: 0.07, duration: 0.3, ease: [0.16, 1, 0.3, 1] },
        }}
        className={clsx(
          'flex h-7 shrink-0 items-center justify-start gap-1 overflow-hidden rounded-full pl-0 pr-1.5',
          'text-main hover:text-main',
          'focus:outline-none',
          'transition-colors duration-150',
          isAvatarMenuOpen && 'bg-dim',
        )}
        title={avatarLabel}
        aria-label={isSignedIn ? 'Profile menu' : 'Sign in menu'}
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex size-7 shrink-0 items-center justify-center"
        >
          {isSignedIn
            ? <UserAvatar
              name={effectiveUser?.name}
              email={effectiveUser?.email}
              profileImageUrl={effectiveUser?.profileImageUrl}
              sizeClass="size-7"
              textClassName="text-[10px]"
              showInitialsFallback={false}
              borderless
            />
            : <IoPersonCircleOutline
              aria-hidden="true"
              size={27}
              className="text-dim"
            />}
        </motion.span>
        <motion.span
          initial={{ opacity: 0, width: 0, x: -5 }}
          animate={{ opacity: 1, width: 13, x: 0 }}
          transition={{ delay: 0.18, duration: 0.2, ease: 'easeOut' }}
          className="block h-[13px] shrink-0 overflow-hidden text-dim"
        >
          <motion.span
            animate={{ y: isAvatarMenuOpen ? -13 : 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col"
          >
            <IoChevronDown aria-hidden="true" size={13} className="shrink-0" />
            <IoChevronUp aria-hidden="true" size={13} className="shrink-0" />
          </motion.span>
        </motion.span>
      </motion.button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="start"
        sideOffset={10}
        className={clsx(
          'z-50 min-w-56 overflow-hidden rounded-xl border border-medium bg-main p-1.5',
          'shadow-xl shadow-black/10 dark:shadow-black/30',
          'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'duration-150',
        )}
      >
        {isSignedIn
          ? <>
            <DropdownMenu.Label className="flex items-center gap-2.5 px-2.5 py-2">
              <UserAvatar
                name={effectiveUser?.name}
                email={effectiveUser?.email}
                profileImageUrl={effectiveUser?.profileImageUrl}
                sizeClass="size-9"
                textClassName="text-xs"
                showInitialsFallback
                borderless
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {effectiveUser?.name || 'Account'}
                </span>
                <span className="block truncate text-xs text-dim">
                  {effectiveUser?.email}
                </span>
              </span>
            </DropdownMenu.Label>
            <DropdownMenu.Separator className="my-1 h-px bg-medium" />
            {renderAvatarMenuLink(
              PATH_FAVORITES,
              'Favorites',
              <IoHeartOutline aria-hidden="true" size={16} className="text-dim" />,
            )}
            {renderAvatarMenuLink(
              PATH_PROFILE,
              'Profile',
              <IoPersonOutline aria-hidden="true" size={16} className="text-dim" />,
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-medium" />
            <DropdownMenu.Item asChild>
              <button
                type="button"
                disabled={isSigningOut}
                aria-busy={isSigningOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
                onClick={() => startSignOutTransition(async () => {
                  await signOutAction();
                  clearAuthStateAndRedirectIfNecessary?.();
                })}
              >
                <span className="flex size-4 items-center justify-center">
                  {isSigningOut
                    ? <Spinner size={14} color="dim" />
                    : <IconSignOut aria-hidden="true" size={16} />}
                </span>
                <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
              </button>
            </DropdownMenu.Item>
          </>
          : <DropdownMenu.Item asChild>
            <LinkWithStatus
              href="/sign-in"
              flickerThreshold={0}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-dim"
            >
              {({ isLoading }) => <>
                <span className={clsx(
                  'flex size-4 items-center justify-center transition-opacity',
                  isLoading && 'opacity-0',
                )}>
                  <IoPersonOutline aria-hidden="true" size={16} className="text-dim" />
                </span>
                <span className="grow">Sign in</span>
                {isLoading && <Spinner size={14} color="dim" />}
              </>}
            </LinkWithStatus>
          </DropdownMenu.Item>}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;

  const switcherSelectionForPath = (): SwitcherSelection | undefined => {
    if (pathname === PATH_ROOT) {
      return GRID_HOMEPAGE_ENABLED ? 'grid' : 'full';
    } else if (isPathGrid(pathname)) {
      return 'grid';
    } else if (isPathFull(pathname)) {
      return 'full';
    } else if (isPathProtected(pathname)) {
      return 'admin';
    }
  };

  return (
    <AppGrid
      className={classNameStickyContainer}
      classNameMain='pointer-events-auto'
      contentMain={
        <AnimateItems
          animateOnFirstLoadOnly
          type={animate && !isPathAdmin(pathname) ? 'bottom' : 'none'}
          distanceOffset={10}
          items={showNav
            ? [<nav
              key="nav"
              ref={ref}
              data-site-header
              className={clsx(
                'w-full flex items-center bg-main',
                NAV_HEIGHT_CLASS,
                // Enlarge nav to ensure it fully masks underlying content
                'md:w-[calc(100%+8px)] md:translate-x-[-4px] md:px-[4px]',
                classNameStickyNav,
              )}>
              <AppViewSwitcher
                currentSelection={switcherSelectionForPath()}
                className="translate-x-[-1px]"
                animate={hasLoadedWithAnimations && isNavVisible}
                accessoryAfter={avatarDropdown}
                isAdminMenuOpen={isAdminMenuOpen}
                setIsAdminMenuOpen={isOpen => {
                  setIsAdminMenuOpen(isOpen);
                  if (isOpen) { setIsAvatarMenuOpen(false); }
                }}
              />
              <div className={clsx(
                'grow text-right min-w-0',
                'translate-y-[-1px]',
              )}>
                <div className="truncate overflow-hidden select-none">
                  {renderLink(navTitle, PATH_ROOT)}
                </div>
                {navCaption &&
                  <div className={clsx(
                    'hidden sm:block truncate overflow-hidden',
                    'leading-tight text-dim',
                  )}>
                    {navCaption}
                  </div>}
              </div>
            </nav>]
            : []}
        />
      }
    />
  );
};
