const MP4_LIKE_EXTENSIONS = new Set(['mp4', 'm4v', 'mov']);
const MP4_VIDEO_CODECS = new Set([
    'h264',
    'avc1',
    'hevc',
    'h265',
    'hev1',
    'hvc1',
]);
const MOBILE_VIDEO_CODECS = new Set(['h264', 'avc1']);
const MOBILE_AUDIO_CODECS = new Set(['aac', 'mp3']);
export const MOBILE_COMPATIBILITY_ENCODING = {
    crf: '20',
    preset: 'veryfast',
    audioBitrate: '192k',
};
export const getCompatibilityStreamStrategy = (metadata) => {
    const videoCodec = metadata.videoCodec?.toLowerCase() || '';
    const audioCodec = metadata.audioCodec?.toLowerCase();
    return MOBILE_VIDEO_CODECS.has(videoCodec) &&
        (!audioCodec || MOBILE_AUDIO_CODECS.has(audioCodec))
        ? 'remux'
        : 'transcode';
};
export const getCanonicalMp4Strategy = (metadata) => {
    const videoCodec = metadata.videoCodec?.toLowerCase() || '';
    const audioCodec = metadata.audioCodec?.toLowerCase();
    return MP4_VIDEO_CODECS.has(videoCodec) &&
        (!audioCodec || MOBILE_AUDIO_CODECS.has(audioCodec))
        ? 'remux'
        : 'transcode';
};
export const needsCompatibilityStream = (extension, metadata) => {
    const normalizedExtension = extension?.toLowerCase() || '';
    const videoCodec = metadata.videoCodec?.toLowerCase() || '';
    const audioCodec = metadata.audioCodec?.toLowerCase();
    return !MP4_LIKE_EXTENSIONS.has(normalizedExtension) ||
        !MOBILE_VIDEO_CODECS.has(videoCodec) ||
        Boolean(audioCodec && !MOBILE_AUDIO_CODECS.has(audioCodec));
};
