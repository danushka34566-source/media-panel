import type { Media } from '.';

export const getDisplayTranscodeStatus = (media: Media) => {
  if (media.mediaType !== 'video') { return undefined; }
  if (!media.transcodeStatus || media.transcodeStatus === 'ready') {
    return undefined;
  }
  return media.transcodeStatus;
};
