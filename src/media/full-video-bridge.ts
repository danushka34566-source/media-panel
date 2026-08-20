/**
 * Browser-safe helpers for the authenticated Drive full-video bridge.
 * Preview URLs must never be passed through this module.
 */
const BRIDGE_PATH = '/api/media/full-video';

const parseUrl = (value: string, base?: string) => {
  try { return new URL(value, base); } catch { return undefined; }
};
export const isLikelyDriveStorageUrl = (value?: string) => {
  if (!value) { return false; }
  const url = parseUrl(value, typeof window !== 'undefined' ? window.location.origin : undefined);
  if (!url) { return false; }
  const segments = url.pathname.split('/').filter(Boolean);
  const storageIndex = segments.findIndex(segment => segment.toLowerCase() === 'storage');
  // Drive's configured object URLs are /storage/{bucket}/{key...}. Avoid
  // bridging the app's own API route when a fallback is already bridged.
  return storageIndex >= 0 && segments.length > storageIndex + 2 &&
    !url.pathname.startsWith(BRIDGE_PATH);
};

export const getFullVideoBridgeUrl = (value: string) => {
  if (!isLikelyDriveStorageUrl(value)) { return value; }
  return `${BRIDGE_PATH}?url=${encodeURIComponent(value)}`;
};

const bridgeUrlForManifestEntry = (entry: string, manifestUrl: string) => {
  const resolved = parseUrl(entry, manifestUrl);
  if (!resolved || !isLikelyDriveStorageUrl(resolved.toString())) { return entry; }
  return getFullVideoBridgeUrl(resolved.toString());
};

/**
 * Rewrite HLS URI attributes and URI lines, including relative references,
 * while preserving comments and non-Drive data URLs. This is pure so it can
 * be tested without a network, auth session, or browser.
 */
export const rewriteDriveHlsManifest = (manifest: string, manifestUrl: string) =>
  manifest.split(/(\r?\n)/).map((line, index, lines) => {
    if (index % 2 === 1 || !line || line.startsWith('#EXT-X-KEY:METHOD=NONE')) {
      return line;
    }
    let rewritten = line;
    rewritten = rewritten.replace(/URI=("|')([^"']+)\1/g, (_match, quote: string, uri: string) =>
      `URI=${quote}${bridgeUrlForManifestEntry(uri, manifestUrl)}${quote}`,
    );
    if (!rewritten.startsWith('#') && rewritten.trim()) {
      const leading = rewritten.match(/^\s*/)?.[0] ?? '';
      const trailing = rewritten.match(/\s*$/)?.[0] ?? '';
      const content = rewritten.trim();
      rewritten = `${leading}${bridgeUrlForManifestEntry(content, manifestUrl)}${trailing}`;
    }
    return rewritten;
  }).join('');

export const isHlsManifestUrl = (value: string) => {
  try { return new URL(value, 'https://media-panel.invalid').pathname.toLowerCase().endsWith('.m3u8'); }
  catch { return false; }
};
