import clsx from 'clsx/lite';
import { getMediaUpdateStatusText } from '.';
import Tooltip from '@/components/Tooltip';
import { Media } from '..';

export default function UpdateTooltip({
  photo,
}: {
  photo: Media
}) {
  return (
    <Tooltip
      content={getMediaUpdateStatusText(photo)}
      classNameTrigger={clsx(
        'text-blue-600 dark:text-blue-400',
        'translate-y-[0.5px]',
      )}
      supportMobile
    />
  );
}
