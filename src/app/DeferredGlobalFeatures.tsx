'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import DeferredCommandK from '@/cmdk/DeferredCommandK';

const GlobalMediaUpload = dynamic(() => import('@/media/GlobalMediaUpload'));
const ShareModals = dynamic(() => import('@/share/ShareModals'));
const RecipeModal = dynamic(() => import('@/recipe/RecipeModal'));

export default function DeferredGlobalFeatures({
  onLastUpload,
}: {
  onLastUpload: () => Promise<void>
}) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const windowWithIdle = window as typeof window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number
      cancelIdleCallback?: (id: number) => void
    };
    const id = windowWithIdle.requestIdleCallback
      ? windowWithIdle.requestIdleCallback(
        () => setIsReady(true),
        { timeout: 1000 },
      )
      : window.setTimeout(() => setIsReady(true), 250);
    return () => {
      if (windowWithIdle.cancelIdleCallback) {
        windowWithIdle.cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, []);

  return <>
    <DeferredCommandK />
    {isReady && <>
      <GlobalMediaUpload shouldResize={false} onLastUpload={onLastUpload} />
      <ShareModals />
      <RecipeModal />
    </>}
  </>;
}
