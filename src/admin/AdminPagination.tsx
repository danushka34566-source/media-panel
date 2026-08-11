'use client';

import { clsx } from 'clsx/lite';
import LinkWithLoaderBackground from '@/components/LinkWithLoaderBackground';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

export default function AdminPagination({
  page,
  pageSize,
  total,
  hrefForPage,
  onPageChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  hrefForPage?: (page: number) => string
  onPageChange?: (page: number) => void
  className?: string
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) { return null; }

  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  const buttonClassName = clsx(
    'inline-flex size-8 min-h-0 items-center justify-center p-0!',
    'rounded-md border border-medium bg-transparent shadow-none',
    'text-main hover:bg-dim disabled:opacity-35',
  );

  const renderControl = (
    direction: 'previous' | 'next',
    targetPage: number,
    disabled: boolean,
  ) => {
    const label = direction === 'previous' ? 'Previous page' : 'Next page';
    const icon = direction === 'previous'
      ? <FiChevronLeft size={16} />
      : <FiChevronRight size={16} />;
    if (!disabled && hrefForPage) {
      return (
        <LinkWithLoaderBackground
          href={hrefForPage(targetPage)}
          prefetch={false}
          aria-label={label}
          className={buttonClassName}
        >
          {icon}
        </LinkWithLoaderBackground>
      );
    }
    return (
      <button
        type="button"
        aria-label={label}
        className={buttonClassName}
        disabled={disabled}
        onClick={() => onPageChange?.(targetPage)}
      >
        {icon}
      </button>
    );
  };

  return (
    <nav
      aria-label="Pagination"
      className={clsx(
        'flex items-center justify-between gap-3 px-0.5 pt-1',
        'text-xs text-dim',
        className,
      )}
    >
      <span>{start}–{end} of {total}</span>
      <div className="flex items-center gap-1.5">
        <span className="mr-1 tabular-nums">
          {currentPage} / {pageCount}
        </span>
        {renderControl('previous', currentPage - 1, currentPage <= 1)}
        {renderControl('next', currentPage + 1, currentPage >= pageCount)}
      </div>
    </nav>
  );
}
