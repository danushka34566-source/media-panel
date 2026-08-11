import MediaOGTile from '@/media/MediaOGTile';
import { absolutePathForMedia } from '@/app/path';
import { Media, titleForMedia } from '.';
import { MediaSetCategory } from '../category';
import ShareModal from '@/share/ShareModal';

export default function MediaShareModal(
  props: { photo: Media } & MediaSetCategory,
) {
  return (
    <ShareModal
      pathShare={absolutePathForMedia(props, true)}
      navigatorTitle={titleForMedia(props.photo) || ''}
      socialText="Check out this photo"
    >
      <MediaOGTile {...props} />
    </ShareModal>
  );
}
