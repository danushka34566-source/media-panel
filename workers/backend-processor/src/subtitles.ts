export type SubtitleProbeStream = {
  index?: number
  codec_type?: string
  codec_name?: string
  tags?: {
    language?: string
    title?: string
  }
}

export type EmbeddedSubtitleTrack = {
  streamIndex: number
  language: string
  label: string
  token: string
  codecName?: string
}

const safeToken = (value: string) => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^[-_]+|[-_]+$/g, '')
  .slice(0, 48);

export const getEmbeddedSubtitleTracks = (
  streams: SubtitleProbeStream[] = [],
): EmbeddedSubtitleTrack[] => {
  const usedTokens = new Map<string, number>();

  return streams
    .filter((stream): stream is SubtitleProbeStream & { index: number } =>
      stream.codec_type === 'subtitle' && Number.isInteger(stream.index))
    .map((stream, subtitleIndex) => {
      const rawLanguage = safeToken(stream.tags?.language?.trim() || '');
      const language = rawLanguage || 'und';
      const baseToken = rawLanguage || `track${subtitleIndex + 1}`;
      const occurrence = (usedTokens.get(baseToken) || 0) + 1;
      usedTokens.set(baseToken, occurrence);
      const token = occurrence === 1 ? baseToken : `${baseToken}-${occurrence}`;
      const title = stream.tags?.title?.trim();

      return {
        streamIndex: stream.index,
        language,
        label: title || (rawLanguage
          ? rawLanguage.toUpperCase()
          : `Subtitle ${subtitleIndex + 1}`),
        token,
        codecName: stream.codec_name,
      };
    });
};
