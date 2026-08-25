'use client';

import { clsx } from 'clsx/lite';

const avatarInitials = (name?: string, email?: string) =>
  (name || email || 'User')
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U';

export default function UserAvatar({
  name,
  email,
  profileImageUrl,
  sizeClass = 'size-10',
  textClassName,
  showInitialsFallback = false,
  borderless = false,
  className,
}: {
  name?: string
  email?: string
  profileImageUrl?: string
  sizeClass?: string
  textClassName?: string
  showInitialsFallback?: boolean
  borderless?: boolean
  className?: string
}) {
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        !borderless && 'border border-medium',
        'bg-dim text-main',
        sizeClass,
        className,
      )}
      aria-hidden="true"
    >
      {profileImageUrl
        ? <img
          src={profileImageUrl}
          alt=""
          className="size-full rounded-full object-cover"
        />
        : showInitialsFallback
          ? <span className={clsx('font-bold leading-none', textClassName)}>
            {avatarInitials(name, email)}
          </span>
          : <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="absolute top-[22%] size-[30%] rounded-full border-[1.5px] border-current opacity-70" />
            <span className="absolute bottom-[18%] h-[34%] w-[54%] rounded-t-full border-[1.5px] border-b-0 border-current opacity-70" />
          </span>}
    </span>
  );
}
