'use client';

import { useEffect, useRef } from 'react';

export default function useVisibility({
  ref,
  onVisible,
  onHidden,
  threshold = 0,
  rootMargin = '0px',
}: {
  ref: React.RefObject<HTMLElement | null>,
  onVisible?: () => void,
  onHidden?: () => void,
  threshold?: number | number[],
  rootMargin?: string,
}) {
  const onVisibleRef = useRef(onVisible);
  const onHiddenRef = useRef(onHidden);
  onVisibleRef.current = onVisible;
  onHiddenRef.current = onHidden;

  useEffect(() => {
    if (ref.current && (onVisible || onHidden)) {
      const observer = new IntersectionObserver(e => {
        if (e[0].isIntersecting) {
          onVisibleRef.current?.();
        } else {
          onHiddenRef.current?.();
        }
      }, {
        root: null,
        threshold,
        rootMargin,
      });
      observer.observe(ref.current);
      return () => observer.disconnect();
    }
  }, [ref, rootMargin, threshold, Boolean(onVisible), Boolean(onHidden)]);
}
