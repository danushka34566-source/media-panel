'use client';

import { ComponentProps, forwardRef, ReactNode, useState } from 'react';
import Link from 'next/link';
import LinkWithStatusChild from './primitives/LinkWithStatusChild';
import clsx from 'clsx/lite';
import { useRouter } from 'next/navigation';

type LinkWithStatusProps = Omit<ComponentProps<typeof Link>, 'children' | 'onLoad'> & {
  children: ReactNode | ((props: { isLoading: boolean }) => ReactNode)
  loadingClassName?: string
  // For hoisting state to a parent component, e.g., <EntityLink />
  isLoading?: boolean
  setIsLoading?: (isLoading: boolean) => void
  onLoad?: () => void
  flickerThreshold?: number
};

const LinkWithStatus = forwardRef<HTMLAnchorElement, LinkWithStatusProps>(function LinkWithStatus({
  children,
  className,
  loadingClassName,
  isLoading: isLoadingProp = false,
  setIsLoading: setIsLoadingProp,
  onLoad,
  flickerThreshold,
  ...props
}, ref) {
  const router = useRouter();
  const [_isLoading, _setIsLoading] = useState(false);
  const isLoading = isLoadingProp || _isLoading;
  const setIsLoading = setIsLoadingProp || _setIsLoading;

  const isControlled = typeof children === 'function';

  return <Link
    ref={ref}
    {...props}
    onPointerDown={event => {
      props.onPointerDown?.(event);
      if (
        event.pointerType === 'touch' &&
        typeof props.href === 'string'
      ) {
        router.prefetch(props.href);
      }
    }}
    className={clsx(
      'transition-[colors,opacity]',
      (loadingClassName || isControlled)
        ? 'opacity-100'
        : isLoading ? 'opacity-50' : 'opacity-100',
      className,
      isLoading && loadingClassName,
    )}
  >
    <LinkWithStatusChild {...{ setIsLoading, flickerThreshold, onLoad }}>
      {typeof children === 'function'
        ? children({ isLoading })
        : children}
    </LinkWithStatusChild>
  </Link>;
});

LinkWithStatus.displayName = 'LinkWithStatus';

export default LinkWithStatus;
