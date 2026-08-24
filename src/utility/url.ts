// Remove protocol, www, and trailing slash from url
export const shortenUrl = (url?: string) => url
  ? url
    .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
    .replace(/\/$/, '')
  : undefined;

// Remove protocol, and trailing slash from url
export const removeUrlProtocol = (url?: string) => url
  ? url
    .replace(/^(?:https?:\/\/)?/i, '')
    .replace(/\/$/, '')
  : undefined;

// Add protocol to url and remove trailing slash
export const makeUrlAbsolute = (url?: string) => url !== undefined
  ? (!url.startsWith('http') ? `https://${url}` : url)
    .replace(/\/$/, '')
  : undefined;

export const removeParamsFromUrl = (urlString: string, params: string[]) => {
  const url = new URL(urlString);
  for (const param of params) {
    url.searchParams.delete(param);
  }
  return url.toString();
};

export const downloadFileFromBrowser = async (
  url: string,
  fileName: string,
) => {
  // Ask the panel to authorize and sign the object, but never stream the file
  // through the application host. The resulting URL points straight at the
  // storage delivery service and expires shortly after it is created.
  const signingUrl = `/api/media/full-video?url=${encodeURIComponent(url)}` +
    `&download=1&filename=${encodeURIComponent(fileName)}`;
  const response = await fetch(signingUrl, {
    method: 'HEAD',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const directUrl = response.ok
    ? response.headers.get('x-media-signed-download') ?? url
    : url;
  const link = document.createElement('a');
  link.href = directUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Necessary for useClientSearchParams to see window.location changes,
// particularly for paths that only change query params
export const replacePathWithEvent = (pathname: string) => {
  window.history.pushState(null, '', pathname);
  dispatchEvent(new Event('replacestate'));
};
