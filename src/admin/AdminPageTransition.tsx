'use client';

import { ReactNode, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import AnimateItems from '@/components/AnimateItems';

export default function AdminPageTransition({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname();
  const items = useMemo(
    () => [<div key={pathname}>{children}</div>],
    [children, pathname],
  );

  return <AnimateItems
    items={items}
    type="bottom"
    distanceOffset={8}
    duration={0.42}
    staggerDelay={0.04}
    fade={false}
  />;
}
