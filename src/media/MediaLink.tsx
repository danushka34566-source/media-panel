'use client';

import { ReactNode, ComponentProps, RefObject } from 'react';
import { Media, titleForMedia } from '@/media';
import { MediaSetCategory } from '@/category';
import { AnimationConfig } from '../components/AnimateItems';
import { useAppState } from '@/app/AppState';
import { pathForMedia } from '@/app/path';
import { clsx } from 'clsx/lite';
import LinkWithStatus from '@/components/LinkWithStatus';
import Spinner from '@/components/Spinner';
import LinkWithLoaderBackground from '@/components/LinkWithLoaderBackground';

export default function MediaLink({
  ref,
  photo,
  scroll,
  prefetch,
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
  nextMediaAnimation?: AnimationConfig
  className?: string
  children?: ReactNode
  loaderType?: 'spinner' | 'badge'
} & MediaSetCategory) {
  const { setNextMediaAnimation } = useAppState();

  const linkProps:
    Omit<ComponentProps<typeof LinkWithStatus>, 'children'> |
    undefined = photo
      ? {
        ref,
        className,
        href: pathForMedia({ photo, ...categories }),
        onClick: () => {
          if (nextMediaAnimation) {
            setNextMediaAnimation?.(nextMediaAnimation);
          }
        },
        scroll,
        prefetch,
      }
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
