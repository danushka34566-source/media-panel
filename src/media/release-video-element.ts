export const releaseVideoElement = (video?: HTMLVideoElement | null) => {
  if (!video) { return; }
  try { video.pause(); } catch { /* document may already be suspended */ }
  try {
    video.removeAttribute('src');
    video.querySelectorAll('source').forEach(source => {
      source.removeAttribute('src');
    });
    // load() after clearing sources tells mobile browsers to release the
    // decoder and buffered media immediately instead of waiting for GC.
    video.load();
  } catch { /* WebKit may reject media operations during page teardown */ }
};
