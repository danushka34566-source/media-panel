import { clsx } from 'clsx/lite';
import { Media } from '.';
import { MediaSetCategory } from '../category';
import MediaGrid from './MediaGrid';
import Link from 'next/link';

export default function MediaLightbox({
  count,
  photos,
  maxMediaToShow = 6,
  moreLink,
  ...categories
}: {
  count: number
  photos: Media[]
  maxMediaToShow?: number
  moreLink: string
} & MediaSetCategory) {  
  const photoCountToShow = maxMediaToShow < count
    ? maxMediaToShow - 1
    : maxMediaToShow;

  const countNotShown = count - photoCountToShow;

  const showOverageTile = countNotShown > 0;

  return (
    <div className={clsx(
      'border-main p-1 rounded-md',
      'bg-gray-50 dark:bg-gray-950',
    )}>
      <MediaGrid
        {...categories}
        photos={photos.slice(0, photoCountToShow)}
        animate={false}
        additionalTile={showOverageTile
          ? <Link
            href={moreLink}
            className={clsx(
              'flex flex-col items-center justify-center',
              'gap-0.5',
              'text-[1.1rem] lg:text-[1.25rem]',
              // Optically adjust for leading '+' character
              'translate-x-[-1px]',
            )}
          >
            +{countNotShown}
          </Link>
          : undefined}
        classNameMedia="rounded-sm overflow-hidden border-main"
        selectable={false}
        small
      />
    </div>
  );
}
