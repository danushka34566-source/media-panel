import { clsx } from 'clsx/lite';
import { IconBaseProps } from 'react-icons';
import { FaPlus } from 'react-icons/fa6';

export default function IconAddUpload({
  className,
  size = 18,
  ...props
}: IconBaseProps) {
  return <FaPlus
    {...props}
    size={size}
    className={clsx('translate-y-[0.5px]', className)}
  />;
}
