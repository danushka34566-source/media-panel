import { absolutePathForFocalLength } from '@/app/path';
import { MediaSetAttributes } from '../category';
import ShareModal from '@/share/ShareModal';
import FocalLengthOGTile from './FocalLengthOGTile';
import { formatFocalLength, shareTextFocalLength } from '.';
import { useAppText } from '@/i18n/state/client';

export default function FocalLengthShareModal({
  focal,
  photos,
  count,
  dateRange,
}: {
  focal: number
} & MediaSetAttributes) {
  const appText = useAppText();
  return (
    <ShareModal
      pathShare={absolutePathForFocalLength(focal, true)}
      navigatorTitle={formatFocalLength(focal)}
      socialText={shareTextFocalLength(focal, appText)}
    >
      <FocalLengthOGTile {...{ focal, photos, count, dateRange }} />
    </ShareModal>
  );
};
