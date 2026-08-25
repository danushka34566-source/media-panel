import { clsx } from 'clsx/lite';
import { IconBaseProps } from 'react-icons';
import { IoHeart, IoHeartOutline } from 'react-icons/io5';

export default function IconFavs({
  highlight,
  className,
  ...props
}: IconBaseProps & { highlight?: boolean}) {
  return highlight
    ? <IoHeart
      {...props}
      className={clsx('text-rose-500 dark:text-pink-400', className)}
    />
    : <IoHeartOutline {...{ ...props, className }} />;
}
