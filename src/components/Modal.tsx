'use client';

import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx/lite';
import { useRouter } from 'next/navigation';
import AnimateItems from './AnimateItems';
import { PATH_ROOT } from '@/app/path';
import usePrefersReducedMotion from '@/utility/usePrefersReducedMotion';
import { goBackOrReplace } from '@/utility/back-navigation';
import { useTheme } from 'next-themes';

export default function Modal({
  onClosePath,
  onClose,
  className,
  anchor = 'center',
  container = true,
  children,
  noPadding,
  fast,
  disablePortal = false,
}: {
  onClosePath?: string
  onClose?: () => void
  className?: string
  anchor?: 'top' | 'center'
  container?: boolean
  children: ReactNode
  noPadding?: boolean
  fast?: boolean
  disablePortal?: boolean
}) {
  const router = useRouter();

  useEffect(() => {
    // Keep wheel/touch scrolling inside the modal while it is open. Preserve
    // the scrollbar compensation so the page underneath does not jump when
    // the lock is applied or removed.
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  const prefersReducedMotion = usePrefersReducedMotion();

  const contentRef = useRef<HTMLDivElement>(null);

  const { resolvedTheme } = useTheme();
  const close = useCallback(() => {
    if (onClose) { onClose(); }
    else { goBackOrReplace(router, onClosePath ?? PATH_ROOT, Boolean(onClosePath)); }
  }, [onClose, onClosePath, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) { return; }
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== contentRef.current) { return; }
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const modalNode = (
    <motion.div
      onMouseDown={event => {
        if (event.currentTarget.contains(event.target as Node) &&
          !contentRef.current?.contains(event.target as Node)) { close(); }
      }}
      className={clsx(
        'fixed inset-0 z-50 flex justify-center',
        anchor === 'top'
          ? 'items-start pt-4 sm:pt-12 lg:pt-24'
          : 'items-center',
        'backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150',
        'overscroll-contain',
      )}
      initial={!prefersReducedMotion
        ? {
          backgroundColor: resolvedTheme === 'dark'
            ? 'rgba(0, 0, 0, 0)'
            : 'rgba(255, 255, 255, 0)',
          backdropFilter: 'blur(0px)',
        }
        : false}
      animate={{
        backgroundColor: resolvedTheme === 'dark'
          ? 'rgba(0, 0, 0, 0.28)'
          : 'rgba(255, 255, 255, 0.32)',
        backdropFilter: 'blur(18px)',
      }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <AnimateItems
        duration={fast ? 0.1 : 0.3}
        items={[<div
          ref={contentRef}
          role="dialog"
          aria-modal="true"
          key="modalContent"
          className={clsx(
            ...container ? [
              // "-2px" accounts for transparent outline
              'w-[calc(100vw-1.5rem-2px)] sm:w-[min(540px,90vw)]',
              !noPadding && 'p-2',
              'rounded-xl outline-medium',
              'bg-white dark:bg-black',
              'shadow-gray-900 shadow-2xl/15',
              'dark:shadow-black dark:shadow-2xl/100',
            ] : [],
            className,
          )}
        >
          {children}
        </div>]}
      />
    </motion.div>
  );

  if (disablePortal) {
    return modalNode;
  }

  if (typeof document === 'undefined') { return null; }

  return createPortal(
    modalNode,
    document.body,
  );
};
