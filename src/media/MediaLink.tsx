'use client';

import { ReactNode, ComponentProps, RefObject } from 'react';
import { Media, titleForMedia } from '@/media';
import { MediaSetCategory } from '@/category';
import { AnimationConfig } from '../components/AnimateItems';
import { useAppState } from '@/app/AppState';
import { useRouter } from 'next/navigation';
import { pathForMedia } from '@/app/path';
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
  replace,
  nextMediaAnimation,
  className,
  children: _children,
  loaderType = 'spinner',
  ...categories
}: {
  ref?: RefObject<HTMLAnchorElement | null>
  photo?: Media
  scroll?: boolean
  prefetch?: boolean
  replace?: boolean
  nextMediaAnimation?: AnimationConfig
  className?: string
  children?: ReactNode
  loaderType?: 'spinner' | 'badge'
} & MediaSetCategory) {
  const { setNextMediaAnimation } = useAppState();
  const router = useRouter();

  const linkProps:
    Omit<ComponentProps<typeof LinkWithStatus>, 'children'> |
    undefined = photo
      ? (() => {
        const href = pathForMedia({ photo, ...categories });
        return {
          ref,
          className,
          href,
          'data-media-id': photo.id,
          onClick: event => {
            // Next/previous detail navigation replaces the current detail
            // route. It must not overwrite the originating grid's saved
            // anchor with the chevron's DOM position; otherwise Back restores
            // to the detail controls instead of the card the user opened.
            if (!replace) {
              rememberMediaScrollPosition(photo.id, event.currentTarget);
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
          // Media details are rendered in an intercepted overlay during
          // client navigation. Never let Next scroll the preserved feed
          // underneath that overlay to the top.
          scroll: scroll ?? false,
          prefetch,
          replace,
        };
      })()
      : undefined;

  const children = photo
    ? (_children ?? titleForMedia(photo))
    : _children;

  return (
    photo && linkProps
      ? loaderType === 'spinner'
        ? <LinkWithStatus {...linkProps}>
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
