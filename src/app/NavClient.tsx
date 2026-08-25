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
import { useRef, useTransition } from 'react';
import useStickyNav from './useStickyNav';
import { useAppState } from '@/app/AppState';
import { signOutAction } from '@/auth/actions';
import UserAvatar from '@/components/UserAvatar';

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

  const avatarDropdown = <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        className={clsx(
          'flex size-7 items-center justify-center rounded-full',
          'text-main hover:text-main',
        )}
        title={avatarLabel}
        aria-label={isSignedIn ? 'Profile menu' : 'Sign in menu'}
      >
        <UserAvatar
          name={effectiveUser?.name}
          email={effectiveUser?.email}
          profileImageUrl={effectiveUser?.profileImageUrl}
          sizeClass="size-7"
          textClassName="text-[10px]"
          showInitialsFallback={false}
        />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="start"
        sideOffset={8}
        className={clsx(
          'z-50 min-w-36 rounded-lg border border-medium bg-main p-1',
          'shadow-lg',
        )}
      >
        {isSignedIn
          ? <>
            <DropdownMenu.Item asChild>
              <Link href={PATH_FAVORITES} className="block rounded-md px-3 py-2 hover:bg-dim">
                Favorites
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link href={PATH_PROFILE} className="block rounded-md px-3 py-2 hover:bg-dim">
                Profile
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left hover:bg-dim"
                onClick={() => startSignOutTransition(async () => {
                  await signOutAction();
                  clearAuthStateAndRedirectIfNecessary?.();
                })}
              >
                {isSigningOut ? 'Signing out...' : 'Sign out'}
              </button>
            </DropdownMenu.Item>
          </>
          : <DropdownMenu.Item asChild>
            <Link href="/sign-in" className="block rounded-md px-3 py-2 hover:bg-dim">
              Sign in
            </Link>
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
                accessoryBeforeSearch={avatarDropdown}
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
