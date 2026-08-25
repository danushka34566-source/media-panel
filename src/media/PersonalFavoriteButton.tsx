'use client';

import { clsx } from 'clsx/lite';
import IconFavs from '@/components/icons/IconFavs';
import usePersonalFavorite from '@/auth/usePersonalFavorite';

export default function PersonalFavoriteButton({
  mediaId,
  readOnly,
  hidden,
  inline = false,
  className,
}: {
  mediaId: string
  readOnly?: boolean
  hidden?: boolean
  inline?: boolean
  className?: string
}) {
  const {
    isFavorite,
    isLoading,
    isReady,
    isUserSignedIn,
    toggle,
  } = usePersonalFavorite(mediaId);

  if (
    !isUserSignedIn ||
    (readOnly && (!isReady || !isFavorite))
  ) { return null; }

  const classes = clsx(
    !inline && 'absolute z-30',
    inline && 'relative z-1',
    'inline-flex items-center justify-center text-white',
    'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]',
    'transition-[opacity,transform] duration-150',
    hidden && 'hidden',
    className,
  );

  if (readOnly) {
    return (
      <span className={classes} aria-label="Saved to favorites">
        <IconFavs
          size={12}
          highlight
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={clsx(
        classes,
        'appearance-none rounded-none! border-0! bg-transparent! p-0!',
        'shadow-none! hover:border-transparent! hover:bg-transparent!',
        'active:bg-transparent! dark:active:bg-transparent!',
        'disabled:border-transparent! disabled:bg-transparent!',
        'dark:disabled:bg-transparent! disabled:shadow-none!',
        'size-9 touch-manipulation select-none',
        '[-webkit-tap-highlight-color:transparent]',
        'hover:scale-110 focus-visible:scale-110 active:scale-90',
        'disabled:opacity-50',
      )}
      aria-label={isFavorite
        ? 'Remove from favorites'
        : 'Add to favorites'}
      aria-pressed={isFavorite}
      aria-busy={isLoading}
      disabled={isLoading}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
    >
      <IconFavs
        size={22}
        highlight={isFavorite}
        className={!isFavorite ? 'text-white' : undefined}
      />
    </button>
  );
}
