'use client';

import useMediaScrollRestoration from './useMediaScrollRestoration';

export default function MediaDetailScrollReset() {
  useMediaScrollRestoration(undefined, true);

  return null;
}
