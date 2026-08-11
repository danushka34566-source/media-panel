const AUTO_ADD_PROCESSING_STORAGE_KEY = 'media-panel:auto-add-processing';
const AUTO_ADD_PROCESSING_TTL_MS = 30 * 60 * 1000;

export const readAutoAddProcessingMap = () => {
  try {
    const raw = window.localStorage.getItem(AUTO_ADD_PROCESSING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, number> : {};
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, startedAt]) =>
        now - startedAt < AUTO_ADD_PROCESSING_TTL_MS),
    );
  } catch {
    return {};
  }
};

export const writeAutoAddProcessingMap = (map: Record<string, number>) => {
  window.localStorage.setItem(
    AUTO_ADD_PROCESSING_STORAGE_KEY,
    JSON.stringify(map),
  );
};

export const isAutoAddProcessingUrl = (url: string) =>
  Boolean(readAutoAddProcessingMap()[url]);

export const markAutoAddProcessingUrl = (url: string) => {
  writeAutoAddProcessingMap({
    ...readAutoAddProcessingMap(),
    [url]: Date.now(),
  });
};

export const clearAutoAddProcessingUrl = (url: string) => {
  const { [url]: _cleared, ...remaining } = readAutoAddProcessingMap();
  writeAutoAddProcessingMap(remaining);
};
