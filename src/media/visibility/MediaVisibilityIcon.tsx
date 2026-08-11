import IconLock from '@/components/icons/IconLock';
import { Media } from '..';
import IconHidden from '@/components/icons/IconHidden';
import { EXCLUDE_DESCRIPTION, PRIVATE_DESCRIPTION } from '.';
import Tooltip from '@/components/Tooltip';

export default function MediaVisibilityIcon({
  photo,
}: {
  photo: Media
}) {
  return photo.hidden
    ? <Tooltip content={PRIVATE_DESCRIPTION} supportMobile>
      <IconLock size={13} />
    </Tooltip>
    : photo.excludeFromFeeds
      ? <Tooltip content={EXCLUDE_DESCRIPTION} supportMobile>
        <IconHidden size={16} className="translate-y-[0.5px]" />
      </Tooltip>
      : null;
}
