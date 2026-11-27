'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ComponentProps, Suspense } from 'react';
import { isPathMedia, PATH_ROOT } from '@/app/path';
import { goBackOrReplace, resolveBackFallbackHref } from '@/utility/back-navigation';

type BackLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & {
  href: string
  matchPath?: boolean
};

function BackLinkAnchor({
  href,
  matchPath,
  ...props
}: BackLinkProps) {
  const router = useRouter();
  return <Link {...props} href={href} onNavigate={event => {
    event.preventDefault();
    goBackOrReplace(router, href, matchPath);
  }} />;
}

function SearchDetailBackLink({ pathname, ...props }: BackLinkProps & {
  pathname: string
}) {
  const params = useSearchParams();
  const href = resolveBackFallbackHref(
    props.href, pathname, params.get('query'), props.matchPath,
  );
  return <BackLinkAnchor {...props} href={href} />;
}

export default function BackLink(props: BackLinkProps) {
  const pathname = usePathname();
  if (!props.matchPath && props.href === PATH_ROOT && isPathMedia(pathname)) {
    return <Suspense fallback={<BackLinkAnchor {...props} />}>
      <SearchDetailBackLink {...props} pathname={pathname} />
    </Suspense>;
  }
  return <BackLinkAnchor {...props} />;
}
