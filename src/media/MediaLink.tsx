'use client';

import { ReactNode, ComponentProps, RefObject, useRef } from 'react';
import { Media, titleForMedia } from '@/media';
import { MediaSetCategory } from '@/category';
import { AnimationConfig } from '../components/AnimateItems';
import { useAppState } from '@/app/AppState';
import { useRouter } from 'next/navigation';
import { pathForMedia } from '@/app/path';
import type { SortBy } from './sort';
import { clsx } from 'clsx/lite';
import LinkWithStatus from '@/components/LinkWithStatus';
import Spinner from '@/components/Spinner';
import LinkWithLoaderBackground from '@/components/LinkWithLoaderBackground';
import { rememberMediaScrollPosition } from './useMediaScrollRestoration';

export default function MediaLink({
  ref,
  photo,
  scroll,
  prefetch,
  rememberAnchor = true,
  nextMediaAnimation,
  className,
  children: _children,
  loaderType = 'spinner',
  onNavigateStart,
  sortBy,
  ...categories
}: {
  ref?: RefObject<HTMLAnchorElement | null>
  photo?: Media
  scroll?: boolean
  prefetch?: boolean
  rememberAnchor?: boolean
  nextMediaAnimation?: AnimationConfig
  className?: string
  children?: ReactNode
  loaderType?: 'spinner' | 'badge'
  onNavigateStart?: () => void
  sortBy?: SortBy
} & MediaSetCategory) {
  const { setNextMediaAnimation } = useAppState();
  const router = useRouter();
  const localRef = useRef<HTMLAnchorElement>(null);
  const anchorRef = ref ?? localRef;

  const linkProps:
    Omit<ComponentProps<typeof LinkWithStatus>, 'children'> |
    undefined = photo
      ? (() => {
        const href = pathForMedia({ photo, sortBy, ...categories });
        return {
          ref: anchorRef,
          className,
          href,
          'data-media-id': photo.id,
          onNavigate: () => {
            onNavigateStart?.();
            if (rememberAnchor) {
              rememberMediaScrollPosition(photo.id, anchorRef.current ?? undefined);
            }
            if (nextMediaAnimation) {
              setNextMediaAnimation?.(nextMediaAnimation);
            }
          },
          onPointerEnter: () => {
            // Next's viewport prefetch is not reliable for controls that are
            // below the fold or reached by keyboard/touch. Warm the exact
            // adjacent detail payload as soon as the user targets it.
            if (prefetch) {
              router.prefetch(href);
            }
          },
          onFocus: () => {
            if (prefetch) {
              router.prefetch(href);
            }
          },
          scroll,
          prefetch,
        };
      })()
      : undefined;

  const children = photo
    ? (_children ?? titleForMedia(photo))
    : _children;

  return (
    photo && linkProps
      ? loaderType === 'spinner'
        ? <LinkWithStatus {...linkProps} flickerThreshold={0}>
          {({ isLoading }) => <>
            {children}
            {isLoading && <>
              &nbsp;<Spinner className="translate-y-[0.5px]" />
            </>}
          </>}
        </LinkWithStatus>
        : <LinkWithLoaderBackground
          {...linkProps}
          offsetPadding
        >
          {children}
        </LinkWithLoaderBackground>
      : <span className={clsx(
        'text-gray-300 dark:text-gray-700 cursor-default',
        className,
      )}>
        {children}
      </span>
  );
};
