const DEFAULT_ASPECT_RATIO = 3.0 / 2.0;

export const parseAspectRatio = (
  value?: string | number,
  fallback = DEFAULT_ASPECT_RATIO,
) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  const trimmed = value?.trim();
  if (!trimmed) { return fallback; }

  const ratioMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    const width = parseFloat(ratioMatch[1]);
    const height = parseFloat(ratioMatch[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
      return width / height;
    }
  }

  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
};

export const getDimensionsFromSize = (
  size: number,
  _aspectRatio?: string | number,
): {
  width: number
  height: number
  aspectRatio: number
} => {
  const aspectRatio = parseAspectRatio(_aspectRatio);

  let width = size;
  let height = size;

  if (aspectRatio > 1) {
    height = size / aspectRatio;
  } else if (aspectRatio < 1) {
    width = size * aspectRatio;
  }
  
  return {
    width: Math.round(width),
    height: Math.round(height),
    aspectRatio,
  };
};
