'use client';

import { ReactNode } from 'react';

export default function AdminPageTransition({
  children,
}: {
  children: ReactNode
}) {
  return <div className={
    '[&>*]:animate-admin-content-in motion-reduce:[&>*]:animate-none'
  }>
    {children}
  </div>;
}
