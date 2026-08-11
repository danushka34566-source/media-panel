export type FfmpegProgress = {
  percent?: number
  timemark?: string
};

const secondsFromTimemark = (timemark?: string) => {
  const parts = timemark?.split(':').map(Number);
  if (!parts || parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
    return undefined;
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

export const getFfmpegProgressPercent = (
  progress: FfmpegProgress,
  durationSeconds?: number,
) => {
  const reported = Number(progress.percent);
  if (Number.isFinite(reported) && reported >= 0) {
    return Math.min(100, reported);
  }
  const processedSeconds = secondsFromTimemark(progress.timemark);
  if (
    processedSeconds === undefined ||
    !durationSeconds ||
    durationSeconds <= 0
  ) {
    return undefined;
  }
  return Math.min(100, processedSeconds / durationSeconds * 100);
};
